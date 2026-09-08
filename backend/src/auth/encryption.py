# Encryption helpers for values stored at rest (GitHub OAuth tokens).
#
# Key policy (lazy + safe): encrypt with the FERNET_KEY env var when set,
# otherwise derive a deterministic Fernet key from the app SECRET_KEY so
# existing installs keep working without a new secret. Rotating either key
# invalidates previously stored ciphertext - users must re-link their GitHub
# account (which rewrites the tokens).

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app

FERNET_ENV_KEY = "FERNET_KEY"
LEGACY_SECRET_FALLBACK = "dev-secret-key"


def _derive_key_from_secret(secret):
    """Derive a stable Fernet key from an arbitrary app secret string."""
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _resolve_key():
    """Prefer FERNET_KEY; otherwise derive deterministically from SECRET_KEY."""
    try:
        fernet_key = current_app.config.get(FERNET_ENV_KEY) or os.getenv(FERNET_ENV_KEY)
        secret_key = current_app.config.get("SECRET_KEY")
    except RuntimeError:  # Outside an app context (unit tests, scripts).
        fernet_key = os.getenv(FERNET_ENV_KEY)
        secret_key = None

    if fernet_key:
        return fernet_key.encode("utf-8")

    secret = secret_key or os.getenv("JWT_SECRET_KEY", LEGACY_SECRET_FALLBACK)
    return _derive_key_from_secret(secret)


def encrypt_token(plaintext):
    """Encrypt a token before persisting it."""
    if not plaintext:
        return None
    return Fernet(_resolve_key()).encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_token(stored):
    """Decrypt a token read from storage."""
    if not stored:
        return None
    try:
        return Fernet(_resolve_key()).decrypt(stored.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        # ponytail: legacy plaintext rows written before encryption-at-rest
        # remain readable; the next OAuth re-link rewrites them as ciphertext.
        return stored