"""Security response headers and CORS `Vary: Origin` on every response.

The headers come from create_app's after_request hook; the `Vary` is what makes
a credentialed-CORS response safe to cache per-origin.
"""

import pytest
from flask import jsonify
from src import app as app_module


@pytest.fixture
def probe_client(monkeypatch):
    """Real create_app() plus one route that returns a normal JSON response."""
    monkeypatch.setenv("FLASK_ENV", "testing")
    app, _socketio = app_module.create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "test-secret-key-for-security-headers-32",
            "JWT_COOKIE_SECURE": False,
            "JWT_COOKIE_SAMESITE": "Lax",
        }
    )

    @app.route("/_test/headers")
    def headers_probe():
        return jsonify({"ok": True})

    return app.test_client()


def test_security_headers_present_on_every_response(probe_client):
    response = probe_client.get("/_test/headers")

    assert response.status_code == 200
    assert response.headers["Content-Security-Policy"] == "default-src 'self'; frame-ancestors 'none'"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "SAMEORIGIN"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["Permissions-Policy"] == "camera=(), microphone=(), geolocation=()"


def test_origin_request_gets_vary_origin(probe_client):
    response = probe_client.get("/_test/headers", headers={"Origin": "http://localhost:3000"})

    assert "Origin" in response.headers.get("Vary", "")
