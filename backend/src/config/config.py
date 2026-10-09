"""Application configuration for DevSync."""

import base64
import hashlib
import hmac
import logging
import os
import re
from ipaddress import ip_address
from urllib.parse import urlparse, urlsplit, urlunsplit

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

POSTGRES_URL_EXAMPLE = "postgresql://<db_user>:<db_password>@localhost:5432/devsync"
LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "db", "postgres"}

# Known insecure placeholders that must never be used outside tests.
# Fail-closed: missing or matching values raise RuntimeError unless testing.
INSECURE_JWT_DEFAULTS = frozenset(
    {
        "",
        "dev-secret-key",
        "your-super-secret-key-for-development-only",
        "change-me-in-local-env",
    }
)

# Domain separation for HKDF-derived keys. Changing these invalidates
# previously derived keys — rotate explicit keys via FERNET_KEYS instead.
FERNET_INFO = b"devsync-fernet-v1"
OAUTH_STATE_INFO = b"devsync-oauth-state-v1"
# Fixed HKDF salt keeps derivation deterministic across restarts without
# storing per-deploy state. Info strings provide domain separation.
HKDF_SALT = b"devsync-hkdf-salt-v1"


def hkdf_sha256(ikm: bytes, salt=None, info=b"", length=32):
    """Minimal HKDF-SHA256 (RFC 5869) via stdlib hmac/hashlib."""
    if not salt:
        salt = b"\x00" * hashlib.sha256().digest_size
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    okm = b""
    block = b""
    counter = 1
    while len(okm) < length:
        block = hmac.new(prk, block + info + bytes([counter]), hashlib.sha256).digest()
        okm += block
        counter += 1
    return okm[:length]


def _is_truthy(value):
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def is_valid_fernet_key(value):
    """True when value is a 32-byte urlsafe-b64 string Fernet accepts."""
    if not isinstance(value, str):
        return False
    token = value.strip()
    if not token:
        return False
    try:
        decoded = base64.urlsafe_b64decode(token.encode("utf-8"))
    except Exception:
        return False
    return len(decoded) == 32


def derive_fernet_key(jwt_secret: str) -> str:
    """Derive a Fernet-compatible key from the JWT secret via HKDF."""
    raw = jwt_secret.encode("utf-8") if isinstance(jwt_secret, str) else bytes(jwt_secret)
    okm = hkdf_sha256(raw, salt=HKDF_SALT, info=FERNET_INFO, length=32)
    return base64.urlsafe_b64encode(okm).decode("utf-8")


def derive_oauth_state_secret(jwt_secret: str) -> str:
    """Derive a dedicated OAuth-state signing key via HKDF (never raw JWT)."""
    raw = jwt_secret.encode("utf-8") if isinstance(jwt_secret, str) else bytes(jwt_secret)
    okm = hkdf_sha256(raw, salt=HKDF_SALT, info=OAUTH_STATE_INFO, length=32)
    return base64.urlsafe_b64encode(okm).decode("utf-8")


def _normalize_postgres_scheme(database_url):
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql://", 1)
    return database_url


def _is_local_database_host(hostname):
    if not hostname:
        return False

    lowered_hostname = hostname.strip().lower()
    if lowered_hostname in LOCAL_DB_HOSTS or lowered_hostname.endswith(".local"):
        return True

    try:
        parsed_ip = ip_address(lowered_hostname)
        return parsed_ip.is_loopback
    except ValueError:
        return False


def _mask_database_url(database_url):
    """Log-safe view of the connection string: scheme/user/host/port/dbname
    kept, password masked as *** (DATABASE_URL carries the DB password)."""
    if not database_url:
        return database_url

    parts = urlsplit(database_url)
    if parts.password is None:
        # No recognizable password region (e.g. malformed URL) — blind-scrub
        # any user:pass@ segment so credentials can never leak into logs.
        return re.sub(r"\S+:\S+@", ":***@", database_url)

    masked_netloc = parts.netloc.replace(f":{parts.password}@", ":***@", 1)
    return urlunsplit(parts._replace(netloc=masked_netloc))


def _append_default_sslmode(database_url):
    """Default sslmode to match local Docker and cloud Postgres setups."""
    if not database_url.startswith("postgresql://") or "sslmode=" in database_url:
        return database_url

    parsed_url = urlparse(database_url)
    sslmode = "disable" if _is_local_database_host(parsed_url.hostname) else "require"
    separator = "&" if parsed_url.query else "?"
    return f"{database_url}{separator}sslmode={sslmode}"


def _resolve_database_uri(env):
    if env == "testing":
        print("[DB CONFIG] Using in-memory SQLite (testing mode)")
        return "sqlite:///:memory:"

    database_url = os.getenv("DATABASE_URL")

    # Debug logs (password masked — DATABASE_URL carries the DB credential)
    print(f"[DB CONFIG] FLASK_ENV: {env}")
    print(f"[DB CONFIG] Raw DATABASE_URL: {_mask_database_url(database_url)}")

    if not database_url:
        raise ValueError(
            "DATABASE_URL is required for non-testing environments. "
            f"Set DATABASE_URL to a PostgreSQL connection string, for example: "
            f"{POSTGRES_URL_EXAMPLE}"
        )

    database_url = database_url.strip()
    print(f"[DB CONFIG] Stripped DATABASE_URL: {_mask_database_url(database_url)}")

    database_url = _normalize_postgres_scheme(database_url)
    print(f"[DB CONFIG] Normalized DATABASE_URL: {_mask_database_url(database_url)}")

    if database_url.startswith("sqlite:"):
        raise ValueError(
            "SQLite is not supported for non-testing environments. "
            f"Set DATABASE_URL to a PostgreSQL connection string, for example: "
            f"{POSTGRES_URL_EXAMPLE}"
        )

    if not database_url.startswith("postgresql://"):
        raise ValueError(
            f"Unsupported DATABASE_URL scheme: {_mask_database_url(database_url)}. "
            f"Use a postgresql:// connection string, for example: {POSTGRES_URL_EXAMPLE}"
        )

    final_url = _append_default_sslmode(database_url)
    print(f"[DB CONFIG] Final DATABASE_URL (with sslmode): {_mask_database_url(final_url)}")

    return final_url


def is_testing_environment(env=None):
    """True only for unit-test runs: FLASK_ENV==testing or pytest active."""
    if env is None:
        env = os.getenv("FLASK_ENV", "development")
    if str(env).lower() == "testing":
        return True
    return bool(os.getenv("PYTEST_CURRENT_TEST"))


def resolve_jwt_secret(explicit_value=None):
    """Return validated JWT secret, fail-closed outside testing.

    Checks explicit_value, then JWT_SECRET_KEY env var only. No fallback
    to SECRET_KEY — Flask sessions and JWT signing must use distinct keys.
    Raises RuntimeError if missing or a known default and not testing.
    Testing fallback (FLASK_ENV==testing or PYTEST_CURRENT_TEST) returns
    the provided value or a test-only fallback without raising.
    """
    env = os.getenv("FLASK_ENV", "development")
    testing = is_testing_environment(env)
    raw = explicit_value
    if raw is None:
        raw = os.getenv("JWT_SECRET_KEY")
    secret = str(raw).strip() if isinstance(raw, str) else raw
    if not secret or secret in INSECURE_JWT_DEFAULTS:
        if testing:
            return secret or "test-secret-key-for-unit-tests"
        logger.error("JWT_SECRET_KEY missing or insecure in FLASK_ENV=%s", env)
        raise RuntimeError(
            "JWT_SECRET_KEY is required and must not be a default/placeholder. "
            "Set JWT_SECRET_KEY to a strong random value. "
            'Generate with: python3 -c "import secrets; print(secrets.token_hex(32))"'
        )
    return secret


def resolve_flask_secret(explicit_value=None):
    """Return validated Flask SECRET_KEY (sessions), fail-closed outside testing.

    Checks explicit_value, then SECRET_KEY env var only. No fallback to
    JWT_SECRET_KEY — the two must be set independently.
    """
    env = os.getenv("FLASK_ENV", "development")
    testing = is_testing_environment(env)
    raw = explicit_value
    if raw is None:
        raw = os.getenv("SECRET_KEY")
    secret = str(raw).strip() if isinstance(raw, str) else raw
    if not secret or secret in INSECURE_JWT_DEFAULTS:
        if testing:
            return secret or "test-secret-key-for-unit-tests"
        logger.error("SECRET_KEY missing or insecure in FLASK_ENV=%s", env)
        raise RuntimeError(
            "SECRET_KEY is required and must not be a default/placeholder. "
            "Set SECRET_KEY to a strong random value distinct from JWT_SECRET_KEY. "
            'Generate with: python3 -c "import secrets; print(secrets.token_hex(32))"'
        )
    return secret


def _collect_fernet_candidates(explicit_value=None):
    candidates = []
    if explicit_value is not None:
        if isinstance(explicit_value, (list, tuple)):
            for entry in explicit_value:
                if entry:
                    candidates.extend(str(entry).split(","))
        elif isinstance(explicit_value, str):
            candidates.extend(explicit_value.split(","))
    env_list = os.getenv("FERNET_KEYS", "")
    if env_list:
        candidates.extend(env_list.split(","))
    env_single = os.getenv("FERNET_KEY", "")
    if env_single and (
        not candidates or env_single.strip() not in [c.strip() for c in candidates if isinstance(c, str)]
    ):
        candidates.append(env_single)
    cleaned = []
    for raw in candidates:
        token = raw.strip() if isinstance(raw, str) else raw
        if not token:
            continue
        if token not in cleaned:
            cleaned.append(token)
    return cleaned


def resolve_fernet_keys(explicit_value=None, jwt_secret=None):
    """Return validated Fernet key list, primary first. Fail-closed in prod.

    Sources (in order): explicit_value, FERNET_KEYS env (comma-separated),
    FERNET_KEY env (single). When empty: testing returns an HKDF-derived
    test key; non-testing requires FERNET_KEY unless ALLOW_DERIVED_FERNET
    is explicitly truthy, in which case an HKDF-derived key is returned
    with a warning log.
    """
    cleaned = _collect_fernet_candidates(explicit_value)
    if cleaned:
        for token in cleaned:
            if not is_valid_fernet_key(token):
                raise RuntimeError(
                    "FERNET_KEY entries must be 32-byte urlsafe-b64 strings. "
                    'Generate with: python3 -c "from cryptography.fernet import '
                    'Fernet; print(Fernet.generate_key().decode())"'
                )
        return cleaned
    env = os.getenv("FLASK_ENV", "development")
    if is_testing_environment(env):
        base = jwt_secret
        if base is None:
            base = os.getenv("JWT_SECRET_KEY") or "test-secret-key-for-unit-tests"
        base = str(base).strip() or "test-secret-key-for-unit-tests"
        return [derive_fernet_key(base)]
    if _is_truthy(os.getenv("ALLOW_DERIVED_FERNET", "")):
        base = jwt_secret if jwt_secret is not None else resolve_jwt_secret()
        logger.warning(
            "Using HKDF-derived FERNET_KEY (ALLOW_DERIVED_FERNET=true). "
            "Set an explicit FERNET_KEY in production for rotation support."
        )
        return [derive_fernet_key(base)]
    logger.error("FERNET_KEY missing in FLASK_ENV=%s", env)
    raise RuntimeError(
        "FERNET_KEY is required in non-testing environments. "
        'Generate with: python3 -c "from cryptography.fernet import '
        'Fernet; print(Fernet.generate_key().decode())" '
        "Or set ALLOW_DERIVED_FERNET=true to allow an HKDF-derived key."
    )


def resolve_fernet_key(explicit_value=None, jwt_secret=None):
    """Return the primary Fernet key (first of resolve_fernet_keys)."""
    return resolve_fernet_keys(explicit_value=explicit_value, jwt_secret=jwt_secret)[0]


def resolve_oauth_state_secret(explicit_value=None, jwt_secret=None):
    """Return dedicated OAuth-state signing key via HKDF, never raw JWT.

    Prefers explicit_value / OAUTH_STATE_SECRET env when set and not a
    known placeholder; otherwise derives from the validated JWT secret.
    """
    raw = explicit_value
    if raw is None:
        raw = os.getenv("OAUTH_STATE_SECRET")
    if isinstance(raw, str):
        token = raw.strip()
        if token and token not in INSECURE_JWT_DEFAULTS:
            return token
        if token and not is_testing_environment():
            logger.error("OAUTH_STATE_SECRET is a known placeholder")
            raise RuntimeError(
                "OAUTH_STATE_SECRET must not be a default/placeholder. "
                "Unset it to use the HKDF-derived default, or set a strong value."
            )
    base = jwt_secret if jwt_secret is not None else resolve_jwt_secret()
    if isinstance(base, str):
        base = base.strip()
    if not base or base in INSECURE_JWT_DEFAULTS:
        # Reuse JWT fail-closed validation for consistent errors.
        base = resolve_jwt_secret(explicit_value=base)
    return derive_oauth_state_secret(base)


def is_valid_cors_origin(value):
    """True when value is an explicit http(s) origin with no wildcards."""
    if not isinstance(value, str):
        return False
    token = value.strip()
    if not token or token in {"*", "null"} or "*" in token:
        return False
    parsed = urlparse(token)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def normalize_origin(value):
    """Normalize to scheme://netloc (drops path/query/fragment)."""
    parsed = urlparse(value.strip())
    return f"{parsed.scheme}://{parsed.netloc}"


def resolve_frontend_url(env=None):
    """Return normalized FRONTEND_URL or ''. Fail-closed on bad values.

    Raises ValueError when FRONTEND_URL is set but not a valid http(s)
    origin, or when production uses non-https (credentials require TLS).
    Loopback hosts (localhost/127.0.0.1/::1) stay http-capable so local
    prod-parity runs don't fail closed.
    """
    raw = os.getenv("FRONTEND_URL", "") or ""
    raw = raw.strip()
    if not raw:
        return ""
    if not is_valid_cors_origin(raw):
        raise ValueError(f"Invalid FRONTEND_URL: {raw!r}. Must be like https://example.com")
    effective_env = (env if env is not None else os.getenv("FLASK_ENV", "development")).lower()
    parsed = urlparse(raw)
    if (
        effective_env == "production"
        and parsed.scheme != "https"
        and (parsed.hostname or "").lower() not in {"localhost", "127.0.0.1", "::1"}
    ):
        raise ValueError("FRONTEND_URL must use https in production")
    return normalize_origin(raw)


def resolve_cors_allowed_origins():
    """Parse CORS_ALLOWED_ORIGINS (comma-separated) into normalized origins.

    Invalid entries (wildcards, missing scheme/host) are skipped — never
    allow '*' together with credentials.
    """
    raw_list = os.getenv("CORS_ALLOWED_ORIGINS", "") or ""
    origins = []
    for entry in raw_list.split(","):
        token = entry.strip()
        if not token:
            continue
        if not is_valid_cors_origin(token):
            logger.warning("Skipping invalid CORS_ALLOWED_ORIGINS entry: %r", token)
            continue
        normalized = normalize_origin(token)
        if normalized not in origins:
            origins.append(normalized)
    return origins


class Config:
    """Base configuration class for the application."""

    SQLALCHEMY_DATABASE_URI = _resolve_database_uri(os.getenv("FLASK_ENV", "development").lower())
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Pool hardening: pre_ping drops stale connections (LB/idle timeouts)
    # instead of serving the next request a dead socket; recycle bounds
    # connection age; size/overflow/timeout are env-tunable per environment.
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_size": int(os.getenv("DB_POOL_SIZE", "10")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "20")),
        "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", "30")),
        "pool_recycle": int(os.getenv("DB_POOL_RECYCLE", "1800")),
    }
    # Three independent keys — no silent fallback between them.
    # SECRET_KEY: Flask sessions. JWT_SECRET_KEY: JWT signing.
    SECRET_KEY = resolve_flask_secret()

    # JWT Configuration
    JWT_SECRET_KEY = resolve_jwt_secret()
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

    # At-rest encryption for tokens in the DB (e.g. GitHub OAuth).
    # Required in prod; HKDF-derived only when ALLOW_DERIVED_FERNET=true.
    # FERNET_KEYS is the rotation list (primary first); FERNET_KEY is primary.
    FERNET_KEYS = resolve_fernet_keys(jwt_secret=JWT_SECRET_KEY)
    FERNET_KEY = FERNET_KEYS[0]

    # Dedicated OAuth-state signing key, HKDF-derived from the JWT secret.
    OAUTH_STATE_SECRET = resolve_oauth_state_secret(jwt_secret=JWT_SECRET_KEY)

    # GitHub OAuth Configuration
    GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
    GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "")

    # Frontend URL (used for redirects and CORS allowlist; https enforced in prod)
    FRONTEND_URL = resolve_frontend_url()


class DevelopmentConfig(Config):
    """Development configuration"""

    DEBUG = True


class ProductionConfig(Config):
    """Production configuration"""

    DEBUG = False


class TestingConfig(Config):
    """Testing configuration"""

    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    # StaticPool (in-memory SQLite) takes no pool args — keep it bare.
    SQLALCHEMY_ENGINE_OPTIONS = {}
    JWT_COOKIE_SECURE = False


def get_config():
    """Returns the appropriate configuration class based on the environment"""
    env = os.environ.get("FLASK_ENV", "development").lower()

    if env == "production":
        return ProductionConfig
    elif env == "testing":
        return TestingConfig
    else:
        return DevelopmentConfig
