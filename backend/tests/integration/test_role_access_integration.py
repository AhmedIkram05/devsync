import os
import sys
from unittest.mock import MagicMock

import pytest
from flask_jwt_extended import create_access_token, get_csrf_token

# Add backend directory to import src.* modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.api.controllers import github_controller
from src.api.routes import (
    admin_routes,
    comments_routes,
    dashboard_routes,
    github_routes,
    projects_routes,
    tasks_routes,
    users_routes,
)
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
    app, _ = app_and_socket
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def auth_headers(client, app, role, user_id=1):
    with app.app_context():
        token = create_access_token(identity={"user_id": user_id}, additional_claims={"role": role})
        csrf = get_csrf_token(token)
    client.set_cookie("access_token_cookie", token)
    client.set_cookie("csrf_access_token", csrf)
    return {"X-CSRF-TOKEN": csrf}


def test_users_route_allows_developers(client, app, monkeypatch):
    handler = MagicMock(return_value=({"users": []}, 200))
    monkeypatch.setattr(users_routes, "get_all_users", handler)

    unauthorized_response = client.get("/api/v1/users")
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    # Developer should be allowed
    dev_response = client.get("/api/v1/users", headers=auth_headers(client, app, "developer"))
    assert dev_response.status_code == 200
    assert dev_response.get_json() == {"users": []}
    assert handler.call_count == 1

    # Team Lead should be allowed
    team_lead_response = client.get("/api/v1/users", headers=auth_headers(client, app, "team_lead"))
    assert team_lead_response.status_code == 200
    assert team_lead_response.get_json() == {"users": []}

    # Admin should also be allowed (hierarchy)
    allowed_response = client.get("/api/v1/users", headers=auth_headers(client, app, "admin"))
    assert allowed_response.status_code == 200
    assert allowed_response.get_json() == {"users": []}
    assert handler.call_count == 3


def test_admin_stats_route_requires_admin_role(client, app, monkeypatch):
    handler = MagicMock(return_value=({"users": {"total": 5}}, 200))
    monkeypatch.setattr(admin_routes, "get_system_stats", handler)

    unauthorized_response = client.get("/api/v1/admin/stats")
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.get("/api/v1/admin/stats", headers=auth_headers(client, app, "developer"))
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()["message"] == "Insufficient permissions"
    assert handler.call_count == 0

    # Team Lead should be allowed
    team_lead_response = client.get("/api/v1/admin/stats", headers=auth_headers(client, app, "team_lead"))
    assert team_lead_response.status_code == 200
    assert team_lead_response.get_json()["users"]["total"] == 5

    allowed_response = client.get("/api/v1/admin/stats", headers=auth_headers(client, app, "admin"))
    assert allowed_response.status_code == 200
    assert allowed_response.get_json()["users"]["total"] == 5
    assert handler.call_count == 2


def test_member_dashboard_route_requires_member_role(client, app, monkeypatch):
    handler = MagicMock(return_value=({"projects": []}, 200))
    monkeypatch.setattr(dashboard_routes, "get_client_dashboard", handler)

    unauthorized_response = client.get("/api/v1/dashboard/client")
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.get("/api/v1/dashboard/client", headers=auth_headers(client, app, "admin"))
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()["message"] == "Insufficient permissions"
    assert handler.call_count == 0

    allowed_response = client.get("/api/v1/dashboard/client", headers=auth_headers(client, app, "developer"))
    assert allowed_response.status_code == 200
    assert allowed_response.get_json() == {"projects": []}
    handler.assert_called_once_with()


def test_task_create_route_allows_developer_role(client, app, monkeypatch):
    handler = MagicMock(return_value=({"message": "Task created"}, 201))
    monkeypatch.setattr(tasks_routes, "create_new_task", handler)

    unauthorized_response = client.post("/api/v1/tasks", json={"title": "New"})
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    allowed_response = client.post(
        "/api/v1/tasks",
        headers=auth_headers(client, app, "developer"),
        json={"title": "New"},
    )
    assert allowed_response.status_code == 201
    assert allowed_response.get_json()["message"] == "Task created"
    handler.assert_called_once_with()

    allowed_response = client.post(
        "/api/v1/tasks",
        headers=auth_headers(client, app, "team_lead"),
        json={"title": "New"},
    )
    assert allowed_response.status_code == 201
    assert allowed_response.get_json()["message"] == "Task created"
    assert handler.call_count == 2


def test_task_delete_route_allows_developer_role(client, app, monkeypatch):
    handler = MagicMock(return_value=("", 204))
    monkeypatch.setattr(tasks_routes, "delete_task_by_id", handler)

    unauthorized_response = client.delete("/api/v1/tasks/1")
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    allowed_response = client.delete("/api/v1/tasks/1", headers=auth_headers(client, app, "developer"))
    assert allowed_response.status_code == 204
    handler.assert_called_once_with(1)

    allowed_response = client.delete("/api/v1/tasks/1", headers=auth_headers(client, app, "admin"))
    assert allowed_response.status_code == 204
    assert handler.call_count == 2


def test_project_create_route_requires_admin_role(client, app, monkeypatch):
    handler = MagicMock(return_value=({"message": "Project created"}, 201))
    monkeypatch.setattr(projects_routes, "create_project", handler)

    unauthorized_response = client.post("/api/v1/projects", json={"name": "New", "description": "Desc"})
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.post(
        "/api/v1/projects",
        headers=auth_headers(client, app, "developer"),
        json={"name": "New", "description": "Desc"},
    )
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()["message"] == "Insufficient permissions"
    assert handler.call_count == 0

    allowed_response = client.post(
        "/api/v1/projects",
        headers=auth_headers(client, app, "admin"),
        json={"name": "New", "description": "Desc"},
    )
    assert allowed_response.status_code == 201
    assert allowed_response.get_json()["message"] == "Project created"
    handler.assert_called_once_with()


def test_project_update_route_requires_admin_role(client, app, monkeypatch):
    handler = MagicMock(return_value=({"message": "Project updated"}, 200))
    monkeypatch.setattr(projects_routes, "update_project", handler)

    unauthorized_response = client.put("/api/v1/projects/5", json={"name": "Update"})
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.put(
        "/api/v1/projects/5",
        headers=auth_headers(client, app, "developer"),
        json={"name": "Update"},
    )
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()["message"] == "Insufficient permissions"
    assert handler.call_count == 0

    allowed_response = client.put(
        "/api/v1/projects/5",
        headers=auth_headers(client, app, "admin"),
        json={"name": "Update"},
    )
    assert allowed_response.status_code == 200
    assert allowed_response.get_json()["message"] == "Project updated"
    handler.assert_called_once_with(5)


def test_project_delete_route_requires_admin_role(client, app, monkeypatch):
    handler = MagicMock(return_value=("", 204))
    monkeypatch.setattr(projects_routes, "delete_project", handler)

    unauthorized_response = client.delete("/api/v1/projects/5")
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.delete("/api/v1/projects/5", headers=auth_headers(client, app, "developer"))
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()["message"] == "Insufficient permissions"
    assert handler.call_count == 0

    allowed_response = client.delete("/api/v1/projects/5", headers=auth_headers(client, app, "admin"))
    assert allowed_response.status_code == 204
    handler.assert_called_once_with(5)


def test_admin_dashboard_route_requires_admin_role(client, app, monkeypatch):
    handler = MagicMock(return_value=({"stats": {"total_users": 3}}, 200))
    monkeypatch.setattr(dashboard_routes, "get_admin_dashboard", handler)

    unauthorized_response = client.get("/api/v1/dashboard/admin")
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.get("/api/v1/dashboard/admin", headers=auth_headers(client, app, "developer"))
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()["message"] == "Insufficient permissions"
    assert handler.call_count == 0

    allowed_response = client.get("/api/v1/dashboard/admin", headers=auth_headers(client, app, "admin"))
    assert allowed_response.status_code == 200
    assert allowed_response.get_json()["stats"]["total_users"] == 3
    handler.assert_called_once_with()


def test_project_tasks_route_requires_auth_and_passes_project_id(client, app, monkeypatch):
    handler = MagicMock(return_value=({"tasks": []}, 200))
    monkeypatch.setattr(projects_routes, "get_project_tasks", handler)

    unauthorized_response = client.get("/api/v1/projects/42/tasks")
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    allowed_response = client.get("/api/v1/projects/42/tasks", headers=auth_headers(client, app, "developer"))
    assert allowed_response.status_code == 200
    assert allowed_response.get_json() == {"tasks": []}
    handler.assert_called_once_with(42)


def test_comments_routes_enforce_auth_and_json_contract(client, app, monkeypatch):
    get_comments_handler = MagicMock(return_value=({"comments": []}, 200))
    create_comment_handler = MagicMock(return_value=({"id": 1, "content": "hello"}, 201))
    monkeypatch.setattr(comments_routes, "get_task_comments", get_comments_handler)
    monkeypatch.setattr(comments_routes, "add_comment", create_comment_handler)

    unauthorized_get_response = client.get("/api/v1/tasks/7/comments")
    assert unauthorized_get_response.status_code == 401
    assert get_comments_handler.call_count == 0

    allowed_get_response = client.get("/api/v1/tasks/7/comments", headers=auth_headers(client, app, "developer"))
    assert allowed_get_response.status_code == 200
    assert allowed_get_response.get_json() == {"comments": []}
    get_comments_handler.assert_called_once_with(7)

    missing_json_response = client.post("/api/v1/tasks/7/comments", headers=auth_headers(client, app, "developer"))
    assert missing_json_response.status_code == 400
    assert missing_json_response.get_json()["message"] == "Missing JSON in request body"
    assert create_comment_handler.call_count == 0

    allowed_create_response = client.post(
        "/api/v1/tasks/7/comments",
        headers=auth_headers(client, app, "developer"),
        json={"content": "hello"},
    )
    assert allowed_create_response.status_code == 201
    assert allowed_create_response.get_json()["content"] == "hello"
    create_comment_handler.assert_called_once_with(7)


def test_github_exchange_rejects_missing_or_invalid_state(client, app, monkeypatch):
    # Unauthenticated callers are rejected before any state handling.
    unauth_response = client.get("/api/v1/github/exchange?code=test-code&state=invalid-state")
    assert unauth_response.status_code == 401

    authed = auth_headers(client, app, "developer")
    missing_code_response = client.get("/api/v1/github/exchange", headers=authed)
    assert missing_code_response.status_code == 400
    assert missing_code_response.get_json()["message"] == "No code provided"

    github_controller.oauth_states.clear()
    parse_state = MagicMock(return_value=None)
    monkeypatch.setattr(github_routes.GitHubClient, "parse_state_param", parse_state)

    invalid_state_response = client.get(
        "/api/v1/github/exchange?code=test-code&state=invalid-state", headers=authed
    )
    assert invalid_state_response.status_code == 400
    assert invalid_state_response.get_json()["message"] == "Invalid state parameter"
    parse_state.assert_called_once_with("invalid-state")


def test_github_callback_post_rejects_invalid_request_and_failed_exchange(client, app, monkeypatch):
    missing_params_response = client.post("/api/v1/github/callback", json={"state": "only-state"})
    assert missing_params_response.status_code == 400
    assert missing_params_response.get_json()["error"] == "Missing required parameters"

    github_controller.oauth_states.clear()
    parse_state = MagicMock(return_value="1")
    exchange_code = MagicMock(return_value=None)
    monkeypatch.setattr(github_routes.GitHubClient, "parse_state_param", parse_state)
    monkeypatch.setattr(github_routes.GitHubClient, "exchange_code_for_token", exchange_code)

    failed_exchange_response = client.post(
        "/api/v1/github/callback",
        headers=auth_headers(client, app, "developer"),
        json={"code": "test-code", "state": "state-without-token"},
    )
    assert failed_exchange_response.status_code == 400
    assert failed_exchange_response.get_json()["error"] == "Failed to obtain access token"
    parse_state.assert_called_once_with("state-without-token")
    exchange_code.assert_called_once_with("test-code")


def test_unauthenticated_protected_routes_require_auth(client):
    # P0-6 regression: "/" must not act as a public wildcard.
    assert client.get("/api/v1/tasks").status_code == 401
    assert client.get("/api/v1/tasks/1").status_code == 401
    assert client.get("/api/v1/admin/stats").status_code == 401
    assert client.get("/api/v1/admin/settings").status_code == 401


def test_cors_rfc1918_origin_gets_no_credentials(client):
    resp = client.get("/health", headers={"Origin": "http://192.168.1.5:3000"})
    assert resp.headers.get("Access-Control-Allow-Origin") in (None, "")
    assert resp.headers.get("Access-Control-Allow-Credentials") in (None, "")
    assert "10.0.0.5" not in str(resp.headers.get("Access-Control-Allow-Origin"))


def test_cors_allowed_origin_works_with_vary(client):
    resp = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert resp.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000"
    assert resp.headers.get("Access-Control-Allow-Credentials") == "true"
    assert "Origin" in resp.headers.get("Vary", "")


def test_options_handler_does_not_swallow_gets(client):
    assert client.options("/api/v1/tasks").status_code in (200, 204)
    # Legit protected GET must 401 (auth), never 404 from a catch-all GET handler.
    assert client.get("/api/v1/tasks").status_code == 401
