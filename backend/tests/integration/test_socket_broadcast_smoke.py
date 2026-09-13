"""Phase 2 §4 socket smoke tests: broadcast receipts, membership emit-guard,
presence TTL (D5). Extends the conventions of test_auth_socket_dashboard_integration.
"""

import os
import sys
from unittest.mock import MagicMock

import pytest
from flask_jwt_extended import create_access_token

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import src.socketio_server as socket_module
from src.app import create_app


@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "testing")

    app, socketio = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "test-secret-key-for-integration-suite-32",
            "JWT_COOKIE_SECURE": False,
            "JWT_COOKIE_SAMESITE": "Lax",
        }
    )

    return app, socketio


@pytest.fixture
def app(app_and_socket):
    """Shadow the session-scoped conftest app: tests here need the full app."""
    app, _ = app_and_socket
    return app


def auth_headers(app, role="developer", user_id=1):
    with app.app_context():
        token = create_access_token(
            identity={"user_id": user_id},
            additional_claims={"role": role},
        )
    return {"Authorization": f"Bearer {token}"}


def _seed_project_89(app):
    """Project 89: members 1 and 2; users 3 (non-member) and 4 (admin) exist."""
    from src.db.models import Project, User, db, project_members

    with app.app_context():
        db.create_all()
        db.session.add_all(
            [
                User(id=1, name="Member One", email="smoke1@example.com", password="x", role="developer"),
                User(id=2, name="Member Two", email="smoke2@example.com", password="x", role="developer"),
                User(id=3, name="Outsider", email="smoke3@example.com", password="x", role="developer"),
                User(id=4, name="Admin", email="smoke4@example.com", password="x", role="admin"),
                Project(id=89, name="Project 89", created_by=1),
            ]
        )
        db.session.flush()
        db.session.execute(
            project_members.insert(),
            [
                {"project_id": 89, "user_id": 1},
                {"project_id": 89, "user_id": 2},
            ],
        )
        db.session.commit()


def _connect(app_and_socket, app, user_id):
    _, socketio = app_and_socket
    ws = socketio.test_client(app, headers=auth_headers(app, user_id=user_id))
    assert ws.is_connected()
    assert ws.emit("register", {}, callback=True)["status"] == "success"
    assert ws.emit("join_project", {"project_id": 89}, callback=True)["status"] == "success"
    return ws


@pytest.fixture
def fake_redis(monkeypatch):
    fake = MagicMock()
    # No stored presence key by default → _presence_delete's race guard is
    # allowed to delete; specific tests override get() to exercise the guard.
    fake.get.return_value = None
    monkeypatch.setattr(socket_module, "get_redis", lambda: fake)
    yield fake


def test_two_members_receive_every_broadcast(app_and_socket, app, fake_redis):
    """§4 smoke: 2 members join → task/comment/project broadcasts → leave → out."""
    _, socketio = app_and_socket

    socket_module.connected_users.clear()
    socket_module.project_rooms.clear()
    _seed_project_89(app)

    one = _connect(app_and_socket, app, 1)
    two = _connect(app_and_socket, app, 2)

    one.emit(
        "task_update",
        {"project_id": 89, "task_id": 9, "update_type": "completed", "timestamp": "t"},
        callback=True,
    )
    one.emit(
        "comment_added",
        {"project_id": 89, "task_id": 9, "comment_id": 33, "mentioned_users": [2], "timestamp": "t"},
        callback=True,
    )
    one.emit("project_updated", {"project_id": 89, "update_type": "member_added", "timestamp": "t"}, callback=True)

    received_one = [e["name"] for e in one.get_received()]
    received_two = [e["name"] for e in two.get_received()]

    # Both members get task_updated + new_comment + project_update; user 2 also
    # gets its personal user_mentioned (pod-local sid lookup).
    assert "task_updated" in received_one and "task_updated" in received_two
    assert "new_comment" in received_one and "new_comment" in received_two
    assert "project_update" in received_one and "project_update" in received_two
    assert "user_mentioned" in received_two

    # leave_project drops the room; then no more broadcasts for user 2.
    assert two.emit("leave_project", {"project_id": 89}, callback=True)["status"] == "success"
    one.emit("task_update", {"project_id": 89, "task_id": 9, "timestamp": "t"}, callback=True)
    received_two_after_leave = [e["name"] for e in two.get_received()]
    assert "task_updated" not in received_two_after_leave

    # Disconnect clears the pod-local registry and deletes the presence key.
    one.disconnect()
    two.disconnect()
    assert 1 not in socket_module.connected_users
    assert 2 not in socket_module.connected_users
    assert fake_redis.delete.call_count >= 2


def test_non_member_cannot_broadcast(app_and_socket, app, fake_redis):
    """§2.3: membership is re-checked on the emit path, join had happened."""
    _, socketio = app_and_socket

    socket_module.connected_users.clear()
    socket_module.project_rooms.clear()
    _seed_project_89(app)

    member = _connect(app_and_socket, app, 1)

    from src.db.models import User, db, project_members

    with app.app_context():
        db.session.add(User(id=5, name="Late Outsider", email="smoke5@example.com", password="x", role="developer"))
        db.session.commit()

    _, socketio = app_and_socket
    intruder = socketio.test_client(app, headers=auth_headers(app, user_id=5))
    assert intruder.emit("register", {}, callback=True)["status"] == "success"

    # join is denied…
    ack = intruder.emit("join_project", {"project_id": 89}, callback=True)
    assert ack["status"] == "error"

    # …and even a raw emit path is guarded server-side: no broadcast happens.
    task_ack = intruder.emit("task_update", {"project_id": 89, "task_id": 9, "timestamp": "t"}, callback=True)
    assert task_ack["status"] == "error"
    comment_ack = intruder.emit(
        "comment_added", {"project_id": 89, "task_id": 9, "comment_id": 7, "timestamp": "t"}, callback=True
    )
    assert comment_ack["status"] == "error"
    project_ack = intruder.emit("project_updated", {"project_id": 89, "timestamp": "t"}, callback=True)
    assert project_ack["status"] == "error"

    events = [e["name"] for e in member.get_received()]
    assert "task_updated" not in events
    assert "new_comment" not in events
    assert "project_update" not in events


def test_admin_can_broadcast(app_and_socket, app, fake_redis):
    _, socketio = app_and_socket

    socket_module.connected_users.clear()
    socket_module.project_rooms.clear()
    _seed_project_89(app)

    member = _connect(app_and_socket, app, 1)

    admin = socketio.test_client(app, headers=auth_headers(app, role="admin", user_id=4))
    admin.emit("register", {}, callback=True)
    assert admin.emit("join_project", {"project_id": 89}, callback=True)["status"] == "success"
    assert (
        admin.emit("task_update", {"project_id": 89, "task_id": 9, "timestamp": "t"}, callback=True)["status"]
        == "success"
    )

    events = member.get_received()
    print("ADMIN-DEBUG events:", events)
    assert "task_updated" in [e["name"] for e in events]


def test_heartbeat_and_room_actions_refresh_presence(app_and_socket, app, fake_redis):
    """D5: 10s heartbeat refreshes the 30s key; register/join also refresh."""
    _, socketio = app_and_socket

    socket_module.connected_users.clear()
    socket_module.project_rooms.clear()
    _seed_project_89(app)

    ws = socketio.test_client(app, headers=auth_headers(app, user_id=1))

    ws.emit("register", {}, callback=True)
    ws.emit("join_project", {"project_id": 89}, callback=True)
    heartbeat = ws.emit("heartbeat", {}, callback=True)

    assert heartbeat["status"] == "success"
    assert heartbeat["ttl_seconds"] == socket_module.PRESENCE_TTL_SECONDS

    # 3:1 margin: TTL is 30s against the 10s heartbeat cadence.
    assert socket_module.PRESENCE_TTL_SECONDS == 30

    setex_keys = [c.args[0] for c in fake_redis.setex.call_args_list]
    assert f"{socket_module.PRESENCE_PREFIX}1" in setex_keys
    rule = [c for c in fake_redis.setex.call_args_list if c.args[0] == f"{socket_module.PRESENCE_PREFIX}1"]
    for call in rule:
        assert call.args[1] == socket_module.PRESENCE_TTL_SECONDS
        # value shape "<pod-id>:<sid>"
        value = call.args[2]
        assert value.startswith(f"{socket_module.POD_ID}:")


def test_presence_delete_is_race_guarded(app_and_socket, app, monkeypatch):
    """Only our own (pod, sid) presence key may be deleted (cross-pod reconnect)."""
    fake = MagicMock()
    fake.get.return_value = None
    monkeypatch.setattr(socket_module, "get_redis", lambda: fake)

    socket_module._presence_delete(1, "sid-ours")

    # No prior key: delete proceeds (defensive path).
    assert fake.delete.call_count == 1

    fake.reset_mock()
    fake.get.return_value = "other-pod:other-sid"
    socket_module._presence_delete(1, "sid-ours")
    assert fake.delete.call_count == 0

    fake.reset_mock()
    fake.get.return_value = f"{socket_module.POD_ID}:sid-ours"
    socket_module._presence_delete(1, "sid-ours")
    assert fake.delete.call_count == 1


def test_emit_degrades_when_mq_down(app_and_socket, app, monkeypatch):
    """D4/§2.4: a dead MQ is logged and dropped — the handler still returns
    a structured response instead of disappearing into an uncaught 500."""
    from unittest.mock import patch

    _, socketio = app_and_socket
    socket_module.connected_users.clear()
    socket_module.project_rooms.clear()
    _seed_project_89(app)
    fake = MagicMock()
    monkeypatch.setattr(socket_module, "get_redis", lambda: fake)

    one = _connect(app_and_socket, app, 1)

    with patch("src.socketio_server.emit", side_effect=OSError("redis down")):
        ack = one.emit("task_update", {"project_id": 89, "task_id": 9, "timestamp": "t"}, callback=True)

    assert ack["status"] == "success"
    one.disconnect()


def test_cors_and_mq_env_matrix(monkeypatch):
    """D2/D4 conditional behaviour: prod pins origins; dev/CI keeps wildcard."""
    # Testing/dev keep the wildcard and no queue unless REDIS_URL is set.
    monkeypatch.setenv("FLASK_ENV", "testing")
    assert socket_module._cors_allowed_origins() == ["*"]
    assert socket_module._message_queue() is None

    monkeypatch.setenv("FLASK_ENV", "development")
    monkeypatch.setenv("REDIS_URL", "redis://override:6400/2")
    assert socket_module._cors_allowed_origins() == ["*"]
    assert socket_module._message_queue() == "redis://override:6400/2"

    # Production pins cross-origin sockets to the single allowed frontend and
    # defaults the queue to the in-cluster service.
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("FRONTEND_URL", "https://gcp.devsyncapp.me")
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert socket_module._cors_allowed_origins() == ["https://gcp.devsyncapp.me"]
    assert socket_module._message_queue() == "redis://devsync-redis:6379/0"

    # Prod without FRONTEND_URL denies all cross-origin sockets (fail closed).
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    assert socket_module._cors_allowed_origins() == []

    # An explicit REDIS_URL (e.g. Memorystore) wins over the default.
    monkeypatch.setenv("REDIS_URL", "redis://memorystore:6379/0")
    assert socket_module._message_queue() == "redis://memorystore:6379/0"
