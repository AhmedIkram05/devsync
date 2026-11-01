"""P0 regression: OAuth states are single-use with a 600s TTL (Redis, memory fallback)."""

import os
import sys
from datetime import datetime, timedelta

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))

from backend.src.api.controllers import github_controller
from backend.src.api.controllers.github_controller import consume_oauth_state, store_oauth_state
from backend.src.services import redis_client


def _no_redis(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    redis_client.reset_for_tests()
    github_controller.oauth_states.clear()


def test_store_consume_roundtrip_is_single_use(monkeypatch):
    _no_redis(monkeypatch)
    store_oauth_state("state-1", 7)
    assert consume_oauth_state("state-1") == 7
    assert consume_oauth_state("state-1") is None


def test_consume_unknown_state_returns_none(monkeypatch):
    _no_redis(monkeypatch)
    assert consume_oauth_state("nope") is None
    assert consume_oauth_state(None) is None


def test_redis_backend_uses_setex_600_and_deletes_on_consume(monkeypatch):
    calls = {}

    class StubRedis:
        def setex(self, key, ttl, value):
            calls["setex"] = (key, ttl, value)
            calls["store"] = value

        def get(self, key):
            calls["get"] = key
            return calls.get("store")

        def delete(self, key):
            calls["delete"] = key
            calls.pop("store", None)

    monkeypatch.setattr(github_controller, "get_redis", lambda: StubRedis())
    store_oauth_state("state-9", 11)
    assert calls["setex"] == ("github_oauth_state:state-9", 600, "11")
    assert consume_oauth_state("state-9") == 11
    assert calls["delete"] == "github_oauth_state:state-9"


def test_memory_fallback_state_expires_after_ttl(monkeypatch):
    """The memory fallback must honour the same TTL as the Redis path."""
    _no_redis(monkeypatch)
    store_oauth_state("stale", 5)
    github_controller.oauth_states["stale"]["created_at"] = datetime.now() - timedelta(
        seconds=github_controller.OAUTH_STATE_TTL_SECONDS + 1
    )

    assert consume_oauth_state("stale") is None


def test_memory_fallback_is_bounded(monkeypatch):
    """A Redis outage must not let the fallback dict grow without bound."""
    _no_redis(monkeypatch)
    monkeypatch.setattr(github_controller, "OAUTH_STATE_MAX_ENTRIES", 3)

    for i in range(10):
        store_oauth_state(f"state-{i}", i)

    assert len(github_controller.oauth_states) <= 3
