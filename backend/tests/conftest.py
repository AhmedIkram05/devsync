import os
import sys

import pytest
from flask import Flask

# Add the backend directory (parent of tests) to sys.path so that "src" can be imported
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(scope="session")
def app():
    """Create and configure a Flask app for testing"""
    app = Flask(__name__)
    app.config.update(
        {
            "TESTING": True,
            "SECRET_KEY": "test_secret_key",
            "JWT_SECRET_KEY": "test_jwt_secret",
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SQLALCHEMY_TRACK_MODIFICATIONS": False,
            "JWT_TOKEN_LOCATION": ["headers"],
        }
    )

    # Register routes
    with app.app_context():
        # We're not initializing the full app with all routes
        # to avoid database connections during unit tests
        pass

    yield app


@pytest.fixture
def client(app):
    """Create a test client for the app"""
    return app.test_client()


@pytest.fixture
def runner(app):
    """Create a test CLI runner for the app"""
    return app.test_cli_runner()


@pytest.fixture
def rate_limiter_redis(monkeypatch):
    """Fresh Redis double for the rate limiter (opt-in; not autouse).

    /auth/* is fail-closed, so with no Redis reachable every auth request is
    denied. Each test gets its own counters, so the real limiter still runs and
    still enforces its budget without leaking state between tests. Tests that
    assert the fail-closed behaviour must NOT request this fixture.
    """

    class _FakeRedis:
        def __init__(self):
            self.counts = {}

        def incr(self, key):
            self.counts[key] = self.counts.get(key, 0) + 1
            return self.counts[key]

        def expire(self, key, seconds):
            return True

    fake = _FakeRedis()
    monkeypatch.setattr("src.api.middlewares.rate_limiter.get_redis", lambda: fake)
    return fake
