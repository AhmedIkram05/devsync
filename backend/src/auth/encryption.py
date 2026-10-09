# Encryption helpers for values stored at rest (GitHub OAuth tokens).
#
# Key policy (lazy + safe): encrypt with the FERNET_KEY env var when set,
# otherwise derive a deterministic Fernet key from the app SECRET_KEY so
# existing installs keep working without a new secret. Rotating either key
# invalidates previously stored ciphertext - users must re-link their GitHub
# account (which rewrites the tokens).

import base64
import hashlib
import logging
import os

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app

logger = logging.getLogger(__name__)

try:
    from src.config.config import INSECURE_JWT_DEFAULTS, is_testing_environment
except ImportError:  # Fallback for backend.src.* import path.
    try:
        from backend.src.config.config import INSECURE_JWT_DEFAULTS, is_testing_environment
    except ImportError:
        INSECURE_JWT_DEFAULTS = frozenset({"", "dev-secret-key"})

        def is_testing_environment(env=None):
            env = env if env is not None else os.getenv("FLASK_ENV", "development")
            if str(env).lower() == "testing":
                return True
            return bool(os.getenv("PYTEST_CURRENT_TEST"))


FERNET_ENV_KEY = "FERNET_KEY"
# Retained for backward compatibility; never used silently outside testing.
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

    secret = secret_key or os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY")
    if isinstance(secret, str):
        secret = secret.strip()
    if not secret or secret in INSECURE_JWT_DEFAULTS:
        if is_testing_environment():
            secret = secret or LEGACY_SECRET_FALLBACK
        else:
            logger.error("JWT/SECRET_KEY missing or insecure for encryption key derivation")
            raise RuntimeError(
                "JWT_SECRET_KEY is required and must not be a default/placeholder. "
                "Set JWT_SECRET_KEY to a strong random value. "
                'Generate with: python3 -c "import secrets; print(secrets.token_hex(32))"'
            )
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
        # Legacy plaintext rows written before encryption-at-rest
        # remain readable; the next OAuth re-link rewrites them as ciphertext.
        return stored
