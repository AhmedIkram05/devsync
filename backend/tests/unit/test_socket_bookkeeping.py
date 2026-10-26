"""Multi-tab socket bookkeeping and task↔project broadcast validation (audit #15)."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask


@pytest.fixture(autouse=True)
def _clean_socket_state():
    import src.socketio_server as socket_module

    socket_module.connected_users.clear()
    socket_module.sid_users.clear()
    socket_module.sid_tokens.clear()
    socket_module.project_rooms.clear()
    yield
    socket_module.connected_users.clear()
    socket_module.sid_users.clear()
    socket_module.sid_tokens.clear()
    socket_module.project_rooms.clear()


def test_two_tabs_map_to_one_user_with_two_sids():
    import src.socketio_server as socket_module

    socket_module._add_user_sid(7, "sid-a")
    socket_module._add_user_sid(7, "sid-b")
    socket_module._add_user_sid(7, "sid-a")  # duplicate sid is idempotent

    assert socket_module.connected_users[7] == {"sid-a", "sid-b"}


def test_disconnect_removes_only_the_dead_tab(monkeypatch):
    import src.socketio_server as socket_module

    socket_module._add_user_sid(7, "sid-a")
    socket_module._add_user_sid(7, "sid-b")
    socket_module.sid_users["sid-a"] = 7
    socket_module.project_rooms[3] = [7]

    monkeypatch.setattr(socket_module, "request", SimpleNamespace(sid="sid-a"))
    socket_module.handle_disconnect()

    # The user still has a live tab: presence bookkeeping and room entries stay.
    assert socket_module.connected_users[7] == {"sid-b"}
    assert socket_module.project_rooms[3] == [7]

    monkeypatch.setattr(socket_module, "request", SimpleNamespace(sid="sid-b"))
    socket_module.handle_disconnect()

    # Last tab closed: the user is fully cleaned up.
    assert 7 not in socket_module.connected_users
    assert socket_module.project_rooms[3] == []


def test_disconnect_falls_back_to_reverse_lookup(monkeypatch):
    import src.socketio_server as socket_module

    socket_module._add_user_sid(9, "sid-x")
    monkeypatch.setattr(socket_module, "request", SimpleNamespace(sid="sid-x"))
    socket_module.handle_disconnect()

    assert 9 not in socket_module.connected_users


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["TESTING"] = True
    with app.app_context():
        yield app


def _authed_socket(monkeypatch, socket_module, sid="sock-1", user_id=1):
    """Pass the authenticated_only gate with a cached handshake identity."""
    decoded = {"exp": 9999999999, "identity": {"user_id": user_id}}
    monkeypatch.setattr(socket_module, "request", SimpleNamespace(sid=sid))
    monkeypatch.setattr(socket_module, "_decode_token", lambda auth_payload=None: decoded)
    monkeypatch.setattr(socket_module, "is_token_revoked", lambda decoded: False)
    socket_module.sid_users[sid] = user_id
    socket_module.sid_tokens[sid] = decoded


def test_task_update_rejects_task_from_another_project(monkeypatch, app):
    import src.socketio_server as socket_module

    _authed_socket(monkeypatch, socket_module)
    monkeypatch.setattr(socket_module, "_membership_denied", lambda project_id, user_id: False)

    mock_db = MagicMock()
    mock_db.session.get.return_value = SimpleNamespace(id=42, project_id=9)
    monkeypatch.setattr(socket_module, "db", mock_db)

    emits = []
    monkeypatch.setattr(socket_module, "_safe_emit", lambda *a, **k: emits.append(a) or True)

    result = socket_module.handle_task_update({"project_id": 5, "task_id": 42}, user_id=1)

    assert result["status"] == "error"
    assert "does not belong" in result["message"]
    assert emits == []


def test_task_update_broadcasts_when_task_matches_project(monkeypatch, app):
    import src.socketio_server as socket_module

    _authed_socket(monkeypatch, socket_module)
    monkeypatch.setattr(socket_module, "_membership_denied", lambda project_id, user_id: False)

    mock_db = MagicMock()
    mock_db.session.get.return_value = SimpleNamespace(id=42, project_id=5)
    monkeypatch.setattr(socket_module, "db", mock_db)

    emits = []
    monkeypatch.setattr(socket_module, "_safe_emit", lambda *a, **k: emits.append(k) or True)

    result = socket_module.handle_task_update({"project_id": "5", "task_id": "42"}, user_id=1)

    assert result["status"] == "success"
    assert emits and emits[0]["to"] == "project_5"


def test_task_update_rejects_unknown_task_id(monkeypatch, app):
    import src.socketio_server as socket_module

    _authed_socket(monkeypatch, socket_module)
    monkeypatch.setattr(socket_module, "_membership_denied", lambda project_id, user_id: False)

    mock_db = MagicMock()
    mock_db.session.get.return_value = None
    monkeypatch.setattr(socket_module, "db", mock_db)

    emits = []
    monkeypatch.setattr(socket_module, "_safe_emit", lambda *a, **k: emits.append(k) or True)

    result = socket_module.handle_task_update({"project_id": 5, "task_id": 999}, user_id=1)

    assert result["status"] == "error"
    assert emits == []
