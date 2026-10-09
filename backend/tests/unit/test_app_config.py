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


def test_jwt_never_falls_back_to_secret_key(monkeypatch):
    from backend.src.config.config import resolve_jwt_secret

    # JWT must not fall back to SECRET_KEY: with JWT missing but SECRET set
    # outside testing, resolving the JWT secret still fail-closes.
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", "")
    monkeypatch.setenv("SECRET_KEY", TEST_FLASK)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY is required"):
        resolve_jwt_secret()
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    assert resolve_jwt_secret() == TEST_JWT


def test_flask_secret_derives_distinct_key_when_unset(monkeypatch):
    from backend.src.config.config import (
        derive_fernet_key,
        derive_oauth_state_secret,
        resolve_flask_secret,
    )

    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.setenv("SECRET_KEY", "")
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)

    derived = resolve_flask_secret()
    # (a) deterministic, (b) never the raw JWT secret, (c) domain-separated
    # from the Fernet- and OAuth-state-derived keys.
    assert derived == resolve_flask_secret(jwt_secret=TEST_JWT)
    assert derived != TEST_JWT
    assert derived != derive_fernet_key(TEST_JWT)
    assert derived != derive_oauth_state_secret(TEST_JWT)


def test_flask_secret_explicit_value_wins(monkeypatch):
    from backend.src.config.config import resolve_flask_secret

    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.setenv("SECRET_KEY", TEST_FLASK)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    assert resolve_flask_secret(jwt_secret=TEST_JWT) == TEST_FLASK
    assert resolve_flask_secret(explicit_value=TEST_FLASK, jwt_secret=TEST_JWT) == TEST_FLASK


def test_production_boot_resolves_with_only_jwt_and_fernet(monkeypatch):
    """Prod supplies JWT_SECRET_KEY + FERNET_KEY but no SECRET_KEY.

    Secret resolution must not raise (that was the CrashLoop regression) and
    must yield a Flask key distinct from the JWT secret. Exercised at the
    resolver layer, not via create_app: building an app binds the process-wide
    SocketIO MQ and would leak into other tests.
    """
    from cryptography.fernet import Fernet

    from backend.src.config.config import (
        resolve_fernet_keys,
        resolve_flask_secret,
        resolve_jwt_secret,
    )

    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    fernet_key = Fernet.generate_key().decode()

    jwt_secret = resolve_jwt_secret()
    flask_secret = resolve_flask_secret(jwt_secret=jwt_secret)
    fernet_keys = resolve_fernet_keys(explicit_value=fernet_key, jwt_secret=jwt_secret)

    assert flask_secret and flask_secret != jwt_secret
    assert fernet_keys == [fernet_key]


def test_fernet_derived_in_development(monkeypatch):
    from backend.src.config.config import is_valid_fernet_key, resolve_fernet_keys

    monkeypatch.setenv("FLASK_ENV", "development")
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.delenv("FERNET_KEY", raising=False)
    monkeypatch.delenv("FERNET_KEYS", raising=False)
    monkeypatch.delenv("ALLOW_DERIVED_FERNET", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    keys = resolve_fernet_keys()
    assert len(keys) == 1
    assert is_valid_fernet_key(keys[0])


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


def test_is_valid_cors_origin_rejects_wildcards_and_bad_scheme():
    from backend.src.config.config import is_valid_cors_origin

    assert is_valid_cors_origin("http://localhost:3000")
    assert is_valid_cors_origin("https://devsyncapp.me")
    assert not is_valid_cors_origin("*")
    assert not is_valid_cors_origin("http://*.example.com")
    assert not is_valid_cors_origin("null")
    assert not is_valid_cors_origin("ftp://example.com")
    assert not is_valid_cors_origin("not-a-url")
    assert not is_valid_cors_origin("")


def test_resolve_frontend_url_enforces_https_in_prod(monkeypatch):
    from backend.src.config.config import resolve_frontend_url

    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")
    assert resolve_frontend_url(env="production") == "https://app.example.com"

    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")
    assert resolve_frontend_url(env="development") == "http://localhost:3000"
    # Loopback stays http-capable even in prod (local prod-parity runs).
    assert resolve_frontend_url(env="production") == "http://localhost:3000"

    monkeypatch.setenv("FRONTEND_URL", "http://app.example.com")
    try:
        with pytest.raises(ValueError, match="https in production"):
            resolve_frontend_url(env="production")
    finally:
        monkeypatch.delenv("FRONTEND_URL", raising=False)

    monkeypatch.setenv("FRONTEND_URL", "*")
    try:
        with pytest.raises(ValueError, match="Invalid FRONTEND_URL"):
            resolve_frontend_url(env="development")
    finally:
        monkeypatch.delenv("FRONTEND_URL", raising=False)


def test_resolve_cors_allowed_origins_skips_invalid(monkeypatch):
    from backend.src.config.config import resolve_cors_allowed_origins

    monkeypatch.setenv(
        "CORS_ALLOWED_ORIGINS",
        "https://app.example.com, *, null, not-a-url, http://localhost:3000",
    )
    origins = resolve_cors_allowed_origins()
    assert "https://app.example.com" in origins
    assert "http://localhost:3000" in origins
    assert "*" not in origins
    assert "null" not in origins
    assert len(origins) == 2


def test_resolve_token_lifetimes_default_to_15_min_7_days(monkeypatch):
    from backend.src.config.config import (
        resolve_access_expire_minutes,
        resolve_refresh_expire_days,
    )

    monkeypatch.delenv("JWT_ACCESS_EXPIRE_MINUTES", raising=False)
    monkeypatch.delenv("JWT_REFRESH_EXPIRE_DAYS", raising=False)
    assert resolve_access_expire_minutes() == 15
    assert resolve_refresh_expire_days() == 7


def test_resolve_token_lifetimes_env_override(monkeypatch):
    from backend.src.config.config import (
        resolve_access_expire_minutes,
        resolve_refresh_expire_days,
    )

    monkeypatch.setenv("JWT_ACCESS_EXPIRE_MINUTES", "45")
    monkeypatch.setenv("JWT_REFRESH_EXPIRE_DAYS", "10")
    assert resolve_access_expire_minutes() == 45
    assert resolve_refresh_expire_days() == 10


def test_resolve_token_lifetimes_explicit_beats_env(monkeypatch):
    from backend.src.config.config import (
        resolve_access_expire_minutes,
        resolve_refresh_expire_days,
    )

    monkeypatch.setenv("JWT_ACCESS_EXPIRE_MINUTES", "45")
    monkeypatch.setenv("JWT_REFRESH_EXPIRE_DAYS", "10")
    assert resolve_access_expire_minutes(explicit_value=25) == 25
    assert resolve_refresh_expire_days(explicit_value=3) == 3


@pytest.mark.parametrize("bad", ["0", "-5", "abc", ""])
def test_resolve_token_lifetimes_reject_non_positive(monkeypatch, bad):
    from backend.src.config.config import resolve_access_expire_minutes

    monkeypatch.setenv("JWT_ACCESS_EXPIRE_MINUTES", bad)
    if bad == "":
        # Blank is treated as unset and falls back to the default.
        assert resolve_access_expire_minutes() == 15
    else:
        with pytest.raises(ValueError, match="positive integer"):
            resolve_access_expire_minutes()


def test_config_class_exposes_token_lifetimes(monkeypatch):
    class_check = _reload_config(monkeypatch, JWT_ACCESS_EXPIRE_MINUTES=None, JWT_REFRESH_EXPIRE_DAYS=None)
    try:
        assert class_check.Config.ACCESS_TOKEN_EXPIRE_MINUTES == 15
        assert class_check.Config.REFRESH_TOKEN_EXPIRE_DAYS == 7
    finally:
        _restore_config(monkeypatch)


def test_is_public_route_exact_or_subpath_only():
    from backend.src.app import PUBLIC_ROUTES, is_public_route

    assert "/" not in PUBLIC_ROUTES
    assert is_public_route("/health")
    assert is_public_route("/health/check")
    assert not is_public_route("/healthcheck")
    assert is_public_route("/api/docs")
    assert is_public_route("/api/docs/extra")
    assert not is_public_route("/api/docs-evil")
    assert is_public_route("/api/v1/auth/login")
    assert not is_public_route("/api/v1/tasks")
    assert not is_public_route("/api/v1/admin/stats")
    assert not is_public_route("/")
