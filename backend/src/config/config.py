"""Application configuration for DevSync."""

import os
from ipaddress import ip_address
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv(override=True)

DEFAULT_LOCAL_POSTGRES_URL = "postgresql://devsync:devsync@localhost:5432/devsync"
LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "db", "postgres"}


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
        return parsed_ip.is_loopback or parsed_ip.is_private
    except ValueError:
        return False


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
        return "sqlite:///:memory:"

    database_url = os.getenv("DATABASE_URL", DEFAULT_LOCAL_POSTGRES_URL)
    database_url = _normalize_postgres_scheme(database_url)

    if database_url.startswith("sqlite:"):
        raise ValueError(
            "SQLite is not supported for non-testing environments. "
            f"Set DATABASE_URL to a PostgreSQL connection string, for example: "
            f"{DEFAULT_LOCAL_POSTGRES_URL}"
        )

    if not database_url.startswith("postgresql://"):
        raise ValueError(
            "Unsupported DATABASE_URL scheme. "
            f"Use a postgresql:// connection string, for example: {DEFAULT_LOCAL_POSTGRES_URL}"
        )

    return _append_default_sslmode(database_url)


class Config:
    """Base configuration class for the application."""

    SQLALCHEMY_DATABASE_URI = _resolve_database_uri(os.getenv("FLASK_ENV", "development").lower())
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key")

    # JWT Configuration
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key")
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

    # GitHub OAuth Configuration
    GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
    GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "")

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False

class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    JWT_COOKIE_SECURE = False

def get_config():
    """Returns the appropriate configuration class based on the environment"""
    env = os.environ.get('FLASK_ENV', 'development').lower()
    
    if env == 'production':
        return ProductionConfig
    elif env == 'testing':
        return TestingConfig
    else:
        return DevelopmentConfig
