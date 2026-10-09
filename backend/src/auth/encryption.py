# Encryption helpers for values stored at rest (GitHub OAuth tokens).
#
# Key policy: FERNET_KEY / FERNET_KEYS env vars hold explicit 32-byte
# urlsafe-b64 keys (primary first). Missing keys fail closed in prod;
# HKDF-derived fallback requires ALLOW_DERIVED_FERNET=true. Decryption
# tries each key in FERNET_KEYS order so rotation keeps old rows readable.

import logging
import os

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app

logger = logging.getLogger(__name__)

try:
    from src.config.config import resolve_fernet_keys
except ImportError:  # Fallback for backend.src.* import path.
    try:
        from backend.src.config.config import resolve_fernet_keys
    except ImportError:
        resolve_fernet_keys = None


FERNET_ENV_KEY = "FERNET_KEY"
FERNET_KEYS_ENV_KEY = "FERNET_KEYS"


def _explicit_candidates():
    """Ordered explicit keys from app config then env (no derivation)."""
    candidates = []
    try:
        cfg_keys = current_app.config.get(FERNET_KEYS_ENV_KEY)
        cfg_single = current_app.config.get(FERNET_ENV_KEY)
    except RuntimeError:  # Outside an app context (unit tests, scripts).
        cfg_keys = None
        cfg_single = None
    if isinstance(cfg_keys, (list, tuple)):
        for entry in cfg_keys:
            if entry:
                candidates.extend(str(entry).split(","))
    elif isinstance(cfg_keys, str) and cfg_keys.strip():
        candidates.extend(cfg_keys.split(","))
    if isinstance(cfg_single, str) and cfg_single.strip():
        candidates.append(cfg_single.strip())
    env_list = os.getenv(FERNET_KEYS_ENV_KEY, "")
    if env_list:
        candidates.extend(env_list.split(","))
    env_single = os.getenv(FERNET_ENV_KEY, "")
    if env_single:
        candidates.append(env_single)
    cleaned = []
    for raw in candidates:
        token = raw.strip() if isinstance(raw, str) else raw
        if token and token not in cleaned:
            cleaned.append(token)
    return cleaned


def get_fernet_keys():
    """Return validated Fernet key list, primary first."""
    explicit = _explicit_candidates()
    if explicit:
        if resolve_fernet_keys is not None:
            return resolve_fernet_keys(explicit_value=explicit)
        from cryptography.fernet import Fernet as _Fernet

        for token in explicit:
            _Fernet(token.encode("utf-8"))
        return explicit
    if resolve_fernet_keys is not None:
        try:
            jwt_secret = current_app.config.get("JWT_SECRET_KEY")
        except RuntimeError:
            jwt_secret = None
        return resolve_fernet_keys(jwt_secret=jwt_secret)
    raise RuntimeError("FERNET_KEY is required (config module unavailable).")


def _primary_key():
    return get_fernet_keys()[0]


def _resolve_key():
    """Backward-compatible primary-key accessor for encrypt path."""
    return _primary_key().encode("utf-8")


def encrypt_token(plaintext):
    """Encrypt a token before persisting it."""
    if not plaintext:
        return None
    return Fernet(_resolve_key()).encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_token(stored):
    """Decrypt a token read from storage; tries each rotation key in order."""
    if not stored:
        return None
    for key in get_fernet_keys():
        try:
            return Fernet(key.encode("utf-8")).decrypt(stored.encode("utf-8")).decode("utf-8")
        except (InvalidToken, ValueError):
            continue
    # Legacy plaintext rows written before encryption-at-rest
    # remain readable; the next OAuth re-link rewrites them as ciphertext.
    return stored
