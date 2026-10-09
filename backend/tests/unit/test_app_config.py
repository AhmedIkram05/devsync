"""Pool hardening config: pre_ping + tunable pool, bare for SQLite tests."""

import importlib
import os
import sys

import pytest

# Ensure Config import never fails at collection when keys are unset locally.
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-config-import-32")
os.environ.setdefault("SECRET_KEY", "test-flask-secret-for-config-import-32")
os.environ.setdefault("ALLOW_DERIVED_FERNET", "true")

import backend.src.config.config  # noqa: F401  (ensures sys.modules entry for reload)

TEST_JWT = "test-secret-key-for-config-unit-tests-32"
TEST_FLASK = "test-flask-secret-for-config-unit-tests-32"


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
    monkeypatch.setenv("SECRET_KEY", TEST_FLASK)
    monkeypatch.delenv("FERNET_KEY", raising=False)
    monkeypatch.delenv("FERNET_KEYS", raising=False)
    monkeypatch.delenv("ALLOW_DERIVED_FERNET", raising=False)
    return importlib.reload(sys.modules["backend.src.config.config"])


def test_engine_options_hardened_defaults(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/devsync")
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.setenv("SECRET_KEY", TEST_FLASK)
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
    monkeypatch.setenv("SECRET_KEY", TEST_FLASK)
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
    monkeypatch.setenv("SECRET_KEY", TEST_FLASK)
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
    monkeypatch.setenv("SECRET_KEY", TEST_FLASK)
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


def test_secret_and_jwt_must_be_distinct_no_silent_fallback(monkeypatch):
    from backend.src.config.config import resolve_flask_secret, resolve_jwt_secret

    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.setenv("SECRET_KEY", "")
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    with pytest.raises(RuntimeError, match="SECRET_KEY is required"):
        resolve_flask_secret()
    # JWT must not fall back to SECRET_KEY.
    monkeypatch.setenv("JWT_SECRET_KEY", "")
    monkeypatch.setenv("SECRET_KEY", TEST_FLASK)
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY is required"):
        resolve_jwt_secret()
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.setenv("SECRET_KEY", TEST_FLASK)
    assert resolve_jwt_secret() == TEST_JWT
    assert resolve_flask_secret() == TEST_FLASK
    assert resolve_jwt_secret() != resolve_flask_secret()


def test_fernet_required_in_prod_unless_derived_allowed(monkeypatch):
    from backend.src.config.config import resolve_fernet_keys

    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.delenv("FERNET_KEY", raising=False)
    monkeypatch.delenv("FERNET_KEYS", raising=False)
    monkeypatch.delenv("ALLOW_DERIVED_FERNET", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    with pytest.raises(RuntimeError, match="FERNET_KEY is required"):
        resolve_fernet_keys()
    monkeypatch.setenv("ALLOW_DERIVED_FERNET", "true")
    derived = resolve_fernet_keys()
    assert len(derived) == 1
    from backend.src.config.config import is_valid_fernet_key

    assert is_valid_fernet_key(derived[0])


def test_fernet_invalid_format_raises(monkeypatch):
    from backend.src.config.config import resolve_fernet_keys

    monkeypatch.setenv("FERNET_KEY", "not-a-valid-fernet-key")
    monkeypatch.delenv("FERNET_KEYS", raising=False)
    with pytest.raises(RuntimeError, match="FERNET_KEY entries must be"):
        resolve_fernet_keys()


def test_fernet_keys_rotation_order(monkeypatch):
    from cryptography.fernet import Fernet

    from backend.src.config.config import resolve_fernet_keys

    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()
    monkeypatch.setenv("FERNET_KEYS", f"{new_key},{old_key}")
    monkeypatch.delenv("FERNET_KEY", raising=False)
    keys = resolve_fernet_keys()
    assert keys == [new_key, old_key]


def test_hkdf_domain_separation_and_oauth_state_derived(monkeypatch):
    from backend.src.config.config import (
        derive_fernet_key,
        derive_oauth_state_secret,
        resolve_oauth_state_secret,
    )

    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.delenv("OAUTH_STATE_SECRET", raising=False)
    fernet_key = derive_fernet_key(TEST_JWT)
    oauth_key = derive_oauth_state_secret(TEST_JWT)
    assert fernet_key != oauth_key
    assert resolve_oauth_state_secret(jwt_secret=TEST_JWT) == oauth_key
    assert resolve_oauth_state_secret(jwt_secret=TEST_JWT) != TEST_JWT
