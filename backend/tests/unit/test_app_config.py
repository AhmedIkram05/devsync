"""Pool hardening config: pre_ping + tunable pool, bare for SQLite tests."""

import importlib
import os
import sys

import pytest

# Ensure Config import never fails at collection when JWT is unset locally.
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-config-import-32")

import backend.src.config.config  # noqa: F401  (ensures sys.modules entry for reload)

TEST_JWT = "test-secret-key-for-config-unit-tests-32"


def _reload_config(monkeypatch, **env):
    for key, value in env.items():
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    module = importlib.reload(sys.modules["backend.src.config.config"])
    return module


def _restore_config(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "testing")
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    return importlib.reload(sys.modules["backend.src.config.config"])


def test_engine_options_hardened_defaults(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/devsync")
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    try:
        config = _reload_config(monkeypatch)
        options = config.ProductionConfig.SQLALCHEMY_ENGINE_OPTIONS
        assert options["pool_pre_ping"] is True
        assert options["pool_size"] == 10
        assert options["max_overflow"] == 20
        assert options["pool_timeout"] == 30
        assert options["pool_recycle"] == 1800
    finally:
        _restore_config(monkeypatch)


def test_engine_options_env_tunable(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/devsync")
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    try:
        config = _reload_config(monkeypatch, DB_POOL_SIZE="5", DB_MAX_OVERFLOW="10")
        options = config.ProductionConfig.SQLALCHEMY_ENGINE_OPTIONS
        assert options["pool_size"] == 5
        assert options["max_overflow"] == 10
    finally:
        _restore_config(monkeypatch)


def test_testing_config_keeps_bare_engine_options():
    from backend.src.config.config import TestingConfig

    # StaticPool (in-memory SQLite) takes no pool args — must stay bare.
    assert TestingConfig.SQLALCHEMY_ENGINE_OPTIONS == {}


def test_jwt_secret_missing_raises_outside_testing(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/devsync")
    # Empty simulates missing: load_dotenv(override=False) would restore a
    # deleted var from .env, but preserves an existing empty value as missing.
    monkeypatch.setenv("JWT_SECRET_KEY", "")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    try:
        with pytest.raises(RuntimeError, match="JWT_SECRET_KEY is required"):
            _reload_config(monkeypatch)
    finally:
        _restore_config(monkeypatch)


@pytest.mark.parametrize(
    "insecure", ["dev-secret-key", "your-super-secret-key-for-development-only", "change-me-in-local-env", ""]
)
def test_jwt_secret_insecure_default_raises_outside_testing(monkeypatch, insecure):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/devsync")
    monkeypatch.setenv("JWT_SECRET_KEY", insecure)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    try:
        with pytest.raises(RuntimeError, match="JWT_SECRET_KEY is required"):
            _reload_config(monkeypatch)
    finally:
        _restore_config(monkeypatch)


def test_jwt_secret_fallback_allowed_in_testing(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "testing")
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    try:
        config = _reload_config(monkeypatch)
        assert config.Config.JWT_SECRET_KEY
        assert config.Config.SECRET_KEY
    finally:
        _restore_config(monkeypatch)
