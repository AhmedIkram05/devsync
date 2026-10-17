"""P1.3: ProxyFix — behind the GKE/GCE LB, request.remote_addr is the client IP.

Without it every anonymous client shares the load balancer's bucket in
get_client_identifier(), and audit hashes record the proxy instead of the user.
"""

import pytest
from flask import jsonify, request
from src import app as app_module


@pytest.fixture
def probe_client(monkeypatch):
    """Real create_app() plus one route that reports what the app sees."""
    monkeypatch.setenv("FLASK_ENV", "testing")
    monkeypatch.delenv("PROXYFIX_X_FOR", raising=False)  # exercise the default depth
    app, _socketio = app_module.create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "test-secret-key-for-proxyfix-suite-32",
            "JWT_COOKIE_SECURE": False,
            "JWT_COOKIE_SAMESITE": "Lax",
        }
    )

    @app.route("/_test/remote-addr")
    def remote_addr():
        return jsonify({"remote_addr": request.remote_addr})

    return app.test_client()


def test_x_forwarded_for_becomes_remote_addr(probe_client):
    response = probe_client.get("/_test/remote-addr", headers={"X-Forwarded-For": "1.2.3.4"})

    assert response.status_code == 200
    assert response.get_json()["remote_addr"] == "1.2.3.4"


def test_no_forwarded_header_leaves_remote_addr_alone(probe_client):
    response = probe_client.get("/_test/remote-addr", environ_base={"REMOTE_ADDR": "9.9.9.9"})

    assert response.get_json()["remote_addr"] == "9.9.9.9"


def test_proxy_x_for_defaults_to_one(monkeypatch):
    monkeypatch.delenv("PROXYFIX_X_FOR", raising=False)
    assert app_module._proxy_x_for() == 1


def test_proxy_x_for_reads_env_and_clamps_negative(monkeypatch):
    monkeypatch.setenv("PROXYFIX_X_FOR", "2")
    assert app_module._proxy_x_for() == 2

    monkeypatch.setenv("PROXYFIX_X_FOR", "-1")
    assert app_module._proxy_x_for() == 0


def test_proxy_x_for_falls_back_on_garbage(monkeypatch):
    monkeypatch.setenv("PROXYFIX_X_FOR", "not-a-number")
    assert app_module._proxy_x_for() == 1
