"""D1: Redis-backed limiter — shared bucket across pods, in-memory fallback."""

import os
import sys
from unittest.mock import patch

import pytest
from flask import Flask, jsonify

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))

import src.services.redis_client as redis_client_module
from src.api.middlewares import rate_limiter
from src.api.middlewares.rate_limiter import (
    _record_hit,
    apply_global_rate_limit,
    rate_limit,
)


class FakeRedis:
    """Counts per bucket key; models the atomic INCR + first-hit EXPIRE script."""

    def __init__(self, counts=None, fail=False):
        self.counts = counts if counts is not None else {}
        self.fail = fail
        self.expire_calls = []
        self.eval_calls = 0

    def eval(self, script, numkeys, key, ttl):
        if self.fail:
            raise ConnectionError("redis down")
        self.eval_calls += 1
        self.counts[key] = self.counts.get(key, 0) + 1
        if self.counts[key] == 1:
            self.expire_calls.append((key, int(ttl)))
        return self.counts[key]


@pytest.fixture
def shared_counter_setup(monkeypatch):
    """REDIS_URL set + injected client; in-memory dicts cleared per test."""
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    rate_limiter.request_counts.clear()
    rate_limiter.request_timestamps.clear()
    redis_client_module._client = None
    yield
    rate_limiter.request_counts.clear()
    rate_limiter.request_timestamps.clear()
    redis_client_module._client = None


def test_redis_bucket_shared_counts_and_first_hit_expiry(shared_counter_setup):
    fake = FakeRedis()
    redis_client_module._client = fake

    assert _record_hit("u1", "e1", requests_per_window=2, window_seconds=60) is False
    assert _record_hit("u1", "e1", requests_per_window=2, window_seconds=60) is False
    assert _record_hit("u1", "e1", requests_per_window=2, window_seconds=60) is True

    # INCR + EXPIRE contract: expiry only on the first hit of the window.
    assert fake.expire_calls and fake.expire_calls[0][1] == 60
    assert len(fake.expire_calls) == 1

    # The memory dicts stay untouched while Redis answers.
    assert rate_limiter.request_counts["u1"]["e1"] == 0


def test_first_request_sets_ttl_in_one_atomic_call(shared_counter_setup):
    """INCR + first-hit EXPIRE happen in a single script call, so a crash between
    them can no longer leave an immortal bucket (no separate incr/expire)."""
    fake = FakeRedis()
    redis_client_module._client = fake

    assert _record_hit("u9", "e1", requests_per_window=5, window_seconds=90) is False
    assert fake.eval_calls == 1
    assert len(fake.expire_calls) == 1
    assert fake.expire_calls[0][1] == 90

    # Later hits reuse the bucket TTL: still one call each, no re-expire.
    assert _record_hit("u9", "e1", requests_per_window=5, window_seconds=90) is False
    assert fake.eval_calls == 2
    assert len(fake.expire_calls) == 1


def test_fail_open_falls_back_to_memory(shared_counter_setup):
    fake = FakeRedis(fail=True)
    redis_client_module._client = fake

    assert _record_hit("u2", "e1", requests_per_window=1, window_seconds=60) is False
    assert _record_hit("u2", "e1", requests_per_window=1, window_seconds=60) is True

    # Fallback ran in the in-memory dicts (per-pod), same boundary semantics.
    assert rate_limiter.request_counts["u2"]["e1"] == 1


def test_unset_redis_url_uses_memory(shared_counter_setup, monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert _record_hit("u3", "e1", requests_per_window=0, window_seconds=60) is False


def test_window_key_contains_endpoint_and_epoch(shared_counter_setup):
    fake = FakeRedis()
    redis_client_module._client = fake
    _record_hit("u1", "epA", requests_per_window=5, window_seconds=60)
    _record_hit("u1", "epB", requests_per_window=5, window_seconds=60)
    keys = sorted(fake.counts.keys())
    assert len(keys) == 2
    assert all(k.startswith("rl:u1:ep") for k in keys)


def test_rate_limit_decorator_returns_429_shape(shared_counter_setup):
    app = Flask(__name__)
    app.config["JWT_SECRET_KEY"] = "x"

    @app.route("/api/v1/login", methods=["POST"])
    @rate_limit(requests_per_window=1, window_seconds=60)
    def login():
        return jsonify({"status": "ok"}), 200

    fake = FakeRedis()
    redis_client_module._client = fake

    with patch("src.api.middlewares.rate_limiter.get_jwt_identity", return_value={"user_id": 7}):
        client = app.test_client()
        first = client.post("/api/v1/login", json={})
        second = client.post("/api/v1/login", json={})

        assert first.status_code == 200
        assert second.status_code == 429
        body = second.get_json()
        assert body["status"] == "error"
        assert "Rate limit exceeded" in body["message"]


def test_global_middleware_shared_bucket_429(shared_counter_setup):
    app = Flask(__name__)

    @app.route("/api/v1/ping")
    def ping():
        return jsonify({"ok": True})

    fake = FakeRedis()
    redis_client_module._client = fake
    apply_global_rate_limit(app, requests_per_window=1, window_seconds=60)

    with patch("src.api.middlewares.rate_limiter.get_jwt_identity", return_value=None):
        client = app.test_client()
        assert client.get("/api/v1/ping").status_code == 200
        second = client.get("/api/v1/ping")
        assert second.status_code == 429
        assert "Global rate limit exceeded" in second.get_json()["message"]
        # /health stays outside the limiter.
        assert client.get("/health").status_code == 404  # no /health route, but NOT 429
