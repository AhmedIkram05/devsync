import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask import Blueprint, Flask, jsonify

from backend.src.api.routes import comments_routes

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))


def passthrough_decorator(*_args, **_kwargs):
    def _decorator(fn):
        return fn

    return _decorator


@pytest.fixture
def app(monkeypatch):
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SECRET_KEY"] = "test-secret-key"
    app.config["JWT_SECRET_KEY"] = "test-secret-key"

    monkeypatch.setattr(comments_routes, "jwt_required", passthrough_decorator)
    monkeypatch.setattr(comments_routes, "role_required", passthrough_decorator, raising=False)
    monkeypatch.setattr(comments_routes, "require_permission", passthrough_decorator, raising=False)
    monkeypatch.setattr(comments_routes, "require_project_membership", lambda fn: fn, raising=False)
    monkeypatch.setattr(comments_routes, "require_comment_task_visibility", lambda fn: fn, raising=False)
    monkeypatch.setattr(comments_routes, "validate_json", passthrough_decorator, raising=False)

    bp = Blueprint("api", __name__, url_prefix="/api/v1")
    comments_routes.register_routes(bp)
    app.register_blueprint(bp)

    return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_comments_routes_registered(app):
    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert "/api/v1/tasks/<int:task_id>/comments" in rules
    assert "/api/v1/comments/<int:comment_id>" in rules


def test_get_task_comments_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({"comments": []}, 200))
    monkeypatch.setattr(comments_routes, "get_task_comments", handler)

    response = client.get("/api/v1/tasks/1/comments")

    assert response.status_code == 200
    assert response.get_json() == {"comments": []}
    handler.assert_called_once_with(1)


def test_add_comment_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({"message": "Comment added successfully"}, 201))
    monkeypatch.setattr(comments_routes, "add_comment", handler)

    response = client.post("/api/v1/tasks/1/comments", json={"content": "New comment"})

    assert response.status_code == 201
    assert response.get_json()["message"] == "Comment added successfully"
    handler.assert_called_once_with(1)


def test_update_comment_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({"message": "Comment updated successfully"}, 200))
    monkeypatch.setattr(comments_routes, "update_comment", handler)

    response = client.put("/api/v1/comments/1", json={"content": "Updated comment"})

    assert response.status_code == 200
    assert response.get_json()["message"] == "Comment updated successfully"
    handler.assert_called_once_with(1)


def test_delete_comment_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({"message": "Comment deleted successfully"}, 200))
    monkeypatch.setattr(comments_routes, "delete_comment", handler)

    response = client.delete("/api/v1/comments/1")

    assert response.status_code == 200
    assert response.get_json()["message"] == "Comment deleted successfully"
    handler.assert_called_once_with(1)


# --- comment visibility gate (/comments/<comment_id> cannot be scoped by task_id) ---


def _gated_view():
    @comments_routes.require_comment_task_visibility
    def protected(comment_id):
        return jsonify({"ok": True}), 200

    return protected


def _call_gated(monkeypatch, user_id=1, role="developer", comment=None, visible=True, comment_id=5):
    monkeypatch.setattr(comments_routes, "get_jwt_identity", lambda: {"user_id": user_id})
    monkeypatch.setattr(comments_routes, "get_jwt", lambda: {"role": role})
    db_mock = MagicMock()
    db_mock.session.get.return_value = comment
    monkeypatch.setattr(comments_routes, "db", db_mock)
    monkeypatch.setattr(comments_routes, "_task_visible_to", lambda _task, _uid: visible)
    with Flask(__name__).test_request_context():
        return _gated_view()(comment_id=comment_id), db_mock.session


def test_visibility_gate_allows_member(monkeypatch):
    task = SimpleNamespace(assigned_to=1, created_by=2, project_id=50)
    comment = SimpleNamespace(id=5, task=task)

    (response, status), session = _call_gated(monkeypatch, comment=comment, visible=True)

    assert status == 200
    assert response.get_json() == {"ok": True}
    session.get.assert_called_once_with(comments_routes.Comment, 5)


def test_visibility_gate_hides_comment_from_non_member(monkeypatch):
    comment = SimpleNamespace(id=5, task=SimpleNamespace(assigned_to=2, created_by=2, project_id=50))

    (response, status), _query = _call_gated(monkeypatch, comment=comment, visible=False)

    assert status == 404
    assert response.get_json() == {"message": "Comment not found"}


def test_visibility_gate_hides_missing_comment(monkeypatch):
    (response, status), _query = _call_gated(monkeypatch, comment=None)

    assert status == 404
    assert response.get_json() == {"message": "Comment not found"}


def test_visibility_gate_lets_admin_bypass(monkeypatch):
    db_mock = MagicMock()
    monkeypatch.setattr(comments_routes, "get_jwt_identity", lambda: {"user_id": 9})
    monkeypatch.setattr(comments_routes, "get_jwt", lambda: {"role": "admin"})
    monkeypatch.setattr(comments_routes, "db", db_mock)
    with Flask(__name__).test_request_context():
        response, status = _gated_view()(comment_id=5)

    assert status == 200
    assert response.get_json() == {"ok": True}
    db_mock.session.get.assert_not_called()


def test_visibility_gate_rejects_invalid_identity(monkeypatch):
    monkeypatch.setattr(comments_routes, "get_jwt_identity", lambda: {"user_id": None})
    monkeypatch.setattr(comments_routes, "get_jwt", lambda: {"role": "developer"})
    with Flask(__name__).test_request_context():
        response, status = _gated_view()(comment_id=5)

    assert status == 401
    assert response.get_json() == {"message": "Invalid user identity"}
