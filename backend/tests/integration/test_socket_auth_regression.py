"""P0 regression: sockets deny unauth + re-validate exp/blocklist every event."""

import os
import sys

import pytest
from flask_jwt_extended import create_access_token, decode_token

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import src.socketio_server as socket_module
from src.app import create_app
from src.auth.token_blocklist import reset_for_tests, revoke_token


@pytest.fixture
def app_and_socket():
    os.environ["FLASK_ENV"] = "testing"
    app, socketio = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "test-secret-key-for-socket-regression-32",
            "JWT_COOKIE_SECURE": False,
            "JWT_COOKIE_SAMESITE": "Lax",
        }
    )
    return app, socketio


@pytest.fixture
def app(app_and_socket):
    app, _ = app_and_socket
    return app


@pytest.fixture(autouse=True)
def clean_state():
    reset_for_tests()
    socket_module.connected_users.clear()
    socket_module.project_rooms.clear()
    socket_module.sid_users.clear()
    socket_module.sid_tokens.clear()
    yield
    socket_module.connected_users.clear()
    socket_module.project_rooms.clear()
    socket_module.sid_users.clear()
    socket_module.sid_tokens.clear()


def _token(app, user_id=1, role="developer"):
    with app.app_context():
        return create_access_token(identity={"user_id": user_id}, additional_claims={"role": role})


def test_unauthenticated_connect_rejected(app_and_socket, app):
    _, socketio = app_and_socket
    ws = socketio.test_client(app)
    assert not ws.is_connected()


def test_invalid_token_connect_rejected(app_and_socket, app):
    _, socketio = app_and_socket
    ws = socketio.test_client(app, headers={"Authorization": "Bearer invalid.token.here"})
    assert not ws.is_connected()


def test_revoked_token_connect_rejected(app_and_socket, app):
    _, socketio = app_and_socket
    token = _token(app)
    with app.app_context():
        payload = decode_token(token)
        revoke_token(payload["jti"], 900)
    ws = socketio.test_client(app, headers={"Authorization": f"Bearer {token}"})
    assert not ws.is_connected()


def test_revoked_token_denied_on_event(app_and_socket, app):
    _, socketio = app_and_socket
    token = _token(app)
    ws = socketio.test_client(app, headers={"Authorization": f"Bearer {token}"})
    assert ws.is_connected()
    assert ws.emit("register", {}, callback=True)["status"] == "success"

    with app.app_context():
        payload = decode_token(token)
        revoke_token(payload["jti"], 900)

    ack = ws.emit("heartbeat", {}, callback=True)
    assert ack is False
    assert not ws.is_connected()
