"""Pool hardening config: pre_ping + tunable pool, bare for SQLite tests."""

import importlib
import sys

import backend.src.config.config  # noqa: F401  (ensures sys.modules entry for reload)


def _reload_config(monkeypatch, **env):
    for key, value in env.items():
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    module = importlib.reload(sys.modules["backend.src.config.config"])
    return module


def test_engine_options_hardened_defaults(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/devsync")
    try:
        config = _reload_config(monkeypatch)
        options = config.ProductionConfig.SQLALCHEMY_ENGINE_OPTIONS
        assert options["pool_pre_ping"] is True
        assert options["pool_size"] == 10
        assert options["max_overflow"] == 20
        assert options["pool_timeout"] == 30
        assert options["pool_recycle"] == 1800
    finally:
        importlib.reload(sys.modules["backend.src.config.config"])


def test_engine_options_env_tunable(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/devsync")
    try:
        config = _reload_config(monkeypatch, DB_POOL_SIZE="5", DB_MAX_OVERFLOW="10")
        options = config.ProductionConfig.SQLALCHEMY_ENGINE_OPTIONS
        assert options["pool_size"] == 5
        assert options["max_overflow"] == 10
    finally:
        importlib.reload(sys.modules["backend.src.config.config"])


def test_testing_config_keeps_bare_engine_options():
    from backend.src.config.config import TestingConfig

    # StaticPool (in-memory SQLite) takes no pool args — must stay bare.
    assert TestingConfig.SQLALCHEMY_ENGINE_OPTIONS == {}
