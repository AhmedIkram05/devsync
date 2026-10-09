"""Application configuration for DevSync."""

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

    Checks explicit_value, then JWT_SECRET_KEY, then SECRET_KEY env vars.
    Raises RuntimeError if missing or a known default and not testing.
    Testing fallback (FLASK_ENV==testing or PYTEST_CURRENT_TEST) returns
    the provided value or a test-only fallback without raising.
    """
    env = os.getenv("FLASK_ENV", "development")
    testing = is_testing_environment(env)
    raw = explicit_value
    if raw is None:
        raw = os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY")
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
    SECRET_KEY = resolve_jwt_secret()

    # JWT Configuration
    JWT_SECRET_KEY = SECRET_KEY
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

    # At-rest encryption key for tokens stored in the DB (e.g. GitHub OAuth).
    # Optional: when unset, a Fernet key is derived deterministically from SECRET_KEY.
    FERNET_KEY = os.getenv("FERNET_KEY", "")

    # GitHub OAuth Configuration
    GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
    GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "")

    # Frontend URL (used for redirects and config checks)
    FRONTEND_URL = os.getenv("FRONTEND_URL", "")


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
