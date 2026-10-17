"""P1.3: fail-closed limiting for credential routes, disable switch, auth 429s."""

import os
import sys
from unittest.mock import patch

import pytest
from flask import Blueprint, Flask

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))

import src.services.redis_client as redis_client_module
from src.api.middlewares import rate_limiter
from src.api.middlewares.rate_limiter import _record_hit
from src.api.routes import auth_routes


class FakeRedis:
    """Counts per bucket key; optionally explodes like a dead Redis."""

    def __init__(self, fail=False):
        self.counts = {}
        self.fail = fail

    def incr(self, key):
        if self.fail:
            raise ConnectionError("redis down")
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    def expire(self, key, seconds):
        return True


def passthrough_decorator(*_args, **_kwargs):
    def _decorator(fn):
        return fn

    return _decorator


@pytest.fixture
def limiter_setup(monkeypatch):
    """REDIS_URL set + injected client; in-memory dicts cleared per test."""
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    rate_limiter.request_counts.clear()
    rate_limiter.request_timestamps.clear()
    redis_client_module._client = None
    yield
    rate_limiter.request_counts.clear()
    rate_limiter.request_timestamps.clear()
    redis_client_module._client = None


@pytest.fixture
def auth_client(monkeypatch):
    """Real /auth/* routes (real rate_limit), stubbed validation + handlers."""
    app = Flask(__name__)
    app.config.update(TESTING=True, SECRET_KEY="test-secret-key", JWT_SECRET_KEY="test-secret-key")

    monkeypatch.setattr(auth_routes, "jwt_required", passthrough_decorator)
    monkeypatch.setattr(auth_routes, "validate_json", passthrough_decorator)
    monkeypatch.setattr(auth_routes, "validate_login_data", lambda _data: None)
    monkeypatch.setattr(auth_routes, "login", lambda: ({"message": "Login successful"}, 200))

    bp = Blueprint("api", __name__, url_prefix="/api/v1")
    auth_routes.register_routes(bp)
    app.register_blueprint(bp)
    return app.test_client()


def test_fail_closed_denies_when_redis_down(limiter_setup):
    redis_client_module._client = FakeRedis(fail=True)

    assert _record_hit("u", "e", requests_per_window=5, window_seconds=60, fail_closed=True) is True
    # Nothing was counted in memory: the deny is not a bucket overflow.
    assert "u" not in rate_limiter.request_counts


def test_fail_closed_denies_when_redis_url_unset(limiter_setup, monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    redis_client_module._client = None

    assert _record_hit("u", "e", requests_per_window=5, window_seconds=60, fail_closed=True) is True


def test_fail_open_falls_back_to_memory(limiter_setup):
    redis_client_module._client = FakeRedis(fail=True)

    assert _record_hit("u", "e", requests_per_window=1, window_seconds=60, fail_closed=False) is False
    assert _record_hit("u", "e", requests_per_window=1, window_seconds=60, fail_closed=False) is True
    assert rate_limiter.request_counts["u"]["e"] == 1


@pytest.mark.parametrize("limit", [0, -1])
def test_non_positive_limit_never_denies_even_fail_closed(limiter_setup, limit):
    """The k6 load job sets RATE_LIMIT_REQUESTS_PER_WINDOW=0; it must not 429."""
    fake = FakeRedis(fail=True)
    redis_client_module._client = fake

    for _ in range(10):
        assert _record_hit("u", "e", requests_per_window=limit, window_seconds=60, fail_closed=True) is False

    assert fake.counts == {}
    assert "u" not in rate_limiter.request_counts


def test_auth_login_429_after_limit_exceeded(limiter_setup, auth_client):
    redis_client_module._client = FakeRedis()

    with patch("src.api.middlewares.rate_limiter.get_jwt_identity", return_value=None):
        statuses = [auth_client.post("/api/v1/auth/login", json={}).status_code for _ in range(6)]

    assert statuses == [200] * 5 + [429]


def test_auth_login_429_body_and_retry_after(limiter_setup, auth_client):
    redis_client_module._client = FakeRedis()

    with patch("src.api.middlewares.rate_limiter.get_jwt_identity", return_value=None):
        for _ in range(5):
            assert auth_client.post("/api/v1/auth/login", json={}).status_code == 200
        denied = auth_client.post("/api/v1/auth/login", json={})

    assert denied.status_code == 429
    assert denied.get_json()["status"] == "error"
    assert "Rate limit exceeded" in denied.get_json()["message"]
    assert denied.headers["Retry-After"] == "60"


def test_auth_login_denied_when_redis_down(limiter_setup, auth_client):
    """Fail-closed: no shared bucket means no credential guessing, not a free pass."""
    redis_client_module._client = FakeRedis(fail=True)

    with patch("src.api.middlewares.rate_limiter.get_jwt_identity", return_value=None):
        response = auth_client.post("/api/v1/auth/login", json={})

    assert response.status_code == 429
    assert response.get_json()["status"] == "error"
