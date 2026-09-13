"""redis_client lifecycle: unset URL, connect, retry window, cached reuse."""

import os
import sys
from unittest.mock import MagicMock

import pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

import src.services.redis_client as redis_client_module


class FakeRedis:
    def __init__(self, ok=True):
        self.pings = 0
        self._ok = ok

    def ping(self):
        self.pings += 1
        if not self._ok:
            raise ConnectionError("redis down")
        return True


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    monkeypatch.setattr(redis_client_module, "_client", None)
    monkeypatch.setattr(redis_client_module, "_failed_at", 0.0)
    yield
    redis_client_module.reset_for_tests()


def test_unset_redis_url_returns_none(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert redis_client_module.get_redis() is None


def test_connect_success_caches_client(monkeypatch):
    fake = FakeRedis(ok=True)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setattr(redis_client_module.redis.Redis, "from_url", MagicMock(return_value=fake))

    first = redis_client_module.get_redis()
    second = redis_client_module.get_redis()

    assert first is fake and second is first
    assert fake.pings == 1  # cached after the first successful ping


def test_connect_failure_enters_retry_window(monkeypatch):
    fake = FakeRedis(ok=False)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setattr(redis_client_module.redis.Redis, "from_url", MagicMock(return_value=fake))

    assert redis_client_module.get_redis() is None
    assert fake.pings == 1
    # Within the 30s cooldown there is NO second attempt: straight None.
    assert redis_client_module.get_redis() is None
    assert fake.pings == 1


def test_retry_after_cooldown_recovers(monkeypatch):
    fake = FakeRedis(ok=False)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setattr(redis_client_module.redis.Redis, "from_url", MagicMock(return_value=fake))
    assert redis_client_module.get_redis() is None

    # Cooldown elapses (monotonic jumps past _RETRY_AFTER_SECONDS); ping now healthy.
    failed = redis_client_module._failed_at
    monkeypatch.setattr(
        redis_client_module.time, "monotonic", lambda: failed + redis_client_module._RETRY_AFTER_SECONDS + 1
    )
    fake._ok = True

    client = redis_client_module.get_redis()
    assert client is fake
    assert fake.pings == 2


def test_reset_for_tests_clears_state(monkeypatch):
    fake = FakeRedis(ok=True)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setattr(redis_client_module.redis.Redis, "from_url", MagicMock(return_value=fake))
    assert redis_client_module.get_redis() is fake

    # Reset clears the cache: the next get_redis() rebuilds (second ping).
    redis_client_module.reset_for_tests()
    redis_client_module.get_redis()
    assert fake.pings == 2
