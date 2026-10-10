import os
import sys
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask_jwt_extended import create_access_token, create_refresh_token, get_csrf_token

# Add backend directory to import src.* modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import src.api.controllers.dashboard_controller as dashboard_controller
import src.auth.auth as auth_module
import src.db.models.models as models_module
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
    app, _ = app_and_socket
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def auth_headers(app, role="developer", user_id=1):
    """Bearer header for Socket.IO handshakes, which authenticate via the
    handshake Authorization header rather than HTTP cookies."""
    with app.app_context():
        token = create_access_token(
            identity={"user_id": user_id},
            additional_claims={"role": role},
        )
    return {"Authorization": f"Bearer {token}"}


def set_access_cookie(client, app, role="developer", user_id=1):
    """Install an access-token cookie (cookie-only JWT auth) and return the raw
    token so it can be replayed on a separate client."""
    with app.app_context():
        token = create_access_token(identity={"user_id": user_id}, additional_claims={"role": role})
        csrf = get_csrf_token(token)
    client.set_cookie("access_token_cookie", token)
    client.set_cookie("csrf_access_token", csrf)
    return token


def set_refresh_cookie(client, app, role="developer", user_id=1):
    """Install a refresh-token cookie and return the raw token + its CSRF value
    (the CSRF pair is captured before rotation replaces the cookies)."""
    with app.app_context():
        token = create_refresh_token(identity={"user_id": user_id}, additional_claims={"role": role})
        csrf = get_csrf_token(token)
    client.set_cookie("refresh_token_cookie", token)
    client.set_cookie("csrf_refresh_token", csrf)
    return token, csrf


def stub_tokens(app, role="developer", user_id=1):
    """With cookie CSRF protection on, set_access_cookies decodes the token to
    derive the double-submit cookie, so a placeholder string no longer works."""
    with app.app_context():
        return {
            "access_token": create_access_token(identity={"user_id": user_id}, additional_claims={"role": role}),
            "refresh_token": create_refresh_token(identity={"user_id": user_id}, additional_claims={"role": role}),
        }


def test_auth_register_success_contract(client, monkeypatch):
    class StubUser:
        query = MagicMock()

        def __init__(self, name, email, password, role):
            self.id = 101
            self.name = name
            self.email = email
            self.password = password
            self.role = role

    StubUser.query.filter_by.return_value.first.return_value = None
    StubUser.query.count.return_value = 1

    session = MagicMock()
    hash_password = MagicMock(return_value="hashed-password")
    generate_tokens = MagicMock(return_value=stub_tokens(client.application))

    monkeypatch.setattr(auth_module, "User", StubUser)
    monkeypatch.setattr(auth_module.settings_service, "get_default_role", MagicMock(return_value="developer"))
    monkeypatch.setattr(auth_module.audit_service, "record", MagicMock())
    monkeypatch.setattr(auth_module, "hash_password", hash_password)
    monkeypatch.setattr(auth_module, "generate_tokens", generate_tokens)
    monkeypatch.setattr(auth_module.db, "session", session, raising=False)

    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Integration User",
            "email": "integration@example.com",
            "password": "password123",
            "role": "developer",
        },
    )

    assert response.status_code == 201
    payload = response.get_json()
    assert payload["message"] == "User registered successfully"
    assert payload["user"]["id"] == 101
    assert payload["user"]["email"] == "integration@example.com"

    hash_password.assert_called_once_with("password123")
    generate_tokens.assert_called_once_with(101, {"role": "developer"})
    session.add.assert_called_once()
    session.commit.assert_called_once_with()


def test_auth_login_success_returns_token_and_github_flags(client, monkeypatch):
    user = SimpleNamespace(
        id=7,
        name="Login User",
        email="login@example.com",
        password="stored-hash",
        role="developer",
        github_username="octocat",
    )

    class StubUser:
        query = MagicMock()

    class StubGitHubToken:
        query = MagicMock()

    StubUser.query.filter_by.return_value.first.return_value = user
    StubGitHubToken.query.filter_by.return_value.first.return_value = None

    verify_password = MagicMock(return_value=True)
    generate_tokens = MagicMock(return_value=stub_tokens(client.application))

    monkeypatch.setattr(auth_module, "User", StubUser)
    monkeypatch.setattr(auth_module, "verify_password", verify_password)
    monkeypatch.setattr(auth_module, "generate_tokens", generate_tokens)
    monkeypatch.setattr(models_module, "GitHubToken", StubGitHubToken)

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "password123"},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["message"] == "Login successful"
    assert payload["user"]["id"] == 7
    assert client.get_cookie("access_token_cookie").value == generate_tokens.return_value["access_token"]
    assert payload["user"]["github_connected"] is False

    verify_password.assert_called_once_with("password123", "stored-hash")
    generate_tokens.assert_called_once_with(7, {"role": "developer"})


def test_auth_token_route_rejects_unknown_user(client, monkeypatch):
    class StubUser:
        query = MagicMock()

    StubUser.query.filter_by.return_value.first.return_value = None
    monkeypatch.setattr(auth_module, "User", StubUser)

    response = client.post(
        "/api/v1/auth/token",
        json={"email": "missing@example.com", "password": "password123"},
    )

    assert response.status_code == 401
    assert response.get_json()["message"] == "Invalid email or password"


def csrf_header(client, refresh=False):
    """Echo the double-submit cookie back the way the SPA does. Needed once the
    client is carrying a JWT cookie, since the cookie wins over the bearer
    header and therefore subjects POST/PUT/PATCH/DELETE to the CSRF check."""
    cookie_name = "csrf_refresh_token" if refresh else "csrf_access_token"
    return {"X-CSRF-TOKEN": client.get_cookie(cookie_name).value}


def test_auth_refresh_and_logout_routes_with_jwt(client, app):
    _, old_csrf = set_refresh_cookie(client, app, user_id=42)
    refresh_response = client.post("/api/v1/auth/refresh", headers={"X-CSRF-TOKEN": old_csrf})
    assert refresh_response.status_code == 200
    set_cookies = refresh_response.headers.getlist("Set-Cookie")
    assert any("access_token_cookie" in c for c in set_cookies)

    set_access_cookie(client, app, user_id=42)
    logout_response = client.post("/api/v1/auth/logout", headers=csrf_header(client))
    assert logout_response.status_code == 200
    assert logout_response.get_json()["message"] == "Logout successful"


def test_socket_room_flow_and_broadcast_events(app_and_socket, app):
    _, socketio = app_and_socket

    socket_module.connected_users.clear()
    socket_module.project_rooms.clear()

    # Seed project 88 with two members and one non-member so the room join is
    # server-side membership-gated.
    from src.db.models import Project, User, db, project_members

    with app.app_context():
        db.create_all()
        db.session.add_all(
            [
                User(id=1, name="Member One", email="member1@example.com", password="x", role="developer"),
                User(id=2, name="Member Two", email="member2@example.com", password="x", role="developer"),
                User(id=3, name="Outsider", email="outsider@example.com", password="x", role="developer"),
                Project(id=88, name="Project 88", created_by=1),
            ]
        )
        db.session.flush()
        db.session.execute(
            project_members.insert(),
            [
                {"project_id": 88, "user_id": 1},
                {"project_id": 88, "user_id": 2},
            ],
        )
        db.session.commit()

    client_one = socketio.test_client(app, headers=auth_headers(app, user_id=1))
    client_two = socketio.test_client(app, headers=auth_headers(app, user_id=2))
    client_three = socketio.test_client(app, headers=auth_headers(app, user_id=3))

    assert client_one.is_connected()
    assert client_two.is_connected()
    assert client_three.is_connected()

    register_one = client_one.emit("register", {}, callback=True)
    register_two = client_two.emit("register", {}, callback=True)
    register_three = client_three.emit("register", {}, callback=True)
    assert register_one["status"] == "success"
    assert register_two["status"] == "success"
    assert register_three["status"] == "success"

    join_one = client_one.emit("join_project", {"project_id": 88}, callback=True)
    join_two = client_two.emit("join_project", {"project_id": 88}, callback=True)
    assert join_one["status"] == "success"
    assert join_two["status"] == "success"

    # A non-member is refused entry to the project room.
    join_three = client_three.emit("join_project", {"project_id": 88}, callback=True)
    assert join_three["status"] == "error"
    assert "not a member" in join_three["message"]

    assert set(socket_module.project_rooms[88]) == {1, 2}

    task_update_ack = client_one.emit(
        "task_update",
        {"project_id": 88, "task_id": 9, "update_type": "completed", "timestamp": "2026-04-20T10:00:00Z"},
        callback=True,
    )
    assert task_update_ack["status"] == "success"

    comment_ack = client_one.emit(
        "comment_added",
        {
            "project_id": 88,
            "task_id": 9,
            "comment_id": 33,
            "mentioned_users": [2],
            "timestamp": "2026-04-20T10:01:00Z",
        },
        callback=True,
    )
    assert comment_ack["status"] == "success"

    project_update_ack = client_one.emit(
        "project_updated",
        {"project_id": 88, "update_type": "member_added", "timestamp": "2026-04-20T10:02:00Z"},
        callback=True,
    )
    assert project_update_ack["status"] == "success"

    leave_two = client_two.emit("leave_project", {"project_id": 88}, callback=True)
    assert leave_two["status"] == "success"
    assert 2 not in socket_module.project_rooms[88]

    client_one.disconnect()
    client_two.disconnect()
    client_three.disconnect()

    assert 1 not in socket_module.connected_users
    assert 2 not in socket_module.connected_users


def test_socket_authenticates_from_access_token_cookie(app_and_socket, app):
    """Cookie-only JWT (P0-5): a same-origin handshake carries the HttpOnly
    access_token_cookie instead of a bearer header, and the socket layer must
    fall back to it during the handshake and on protected events."""
    _, socketio = app_and_socket

    socket_module.connected_users.clear()
    socket_module.sid_users.clear()

    with app.app_context():
        token = create_access_token(identity={"user_id": 77}, additional_claims={"role": "developer"})

    ws_client = socketio.test_client(
        app,
        headers={"Cookie": f"access_token_cookie={token}"},
    )
    assert ws_client.is_connected()

    ack = ws_client.emit("register", {}, callback=True)
    assert ack["status"] == "success"
    assert 77 in socket_module.connected_users

    ws_client.disconnect()


def test_socket_handlers_validate_required_payload_fields(app_and_socket, app):
    _, socketio = app_and_socket

    socket_module.connected_users.clear()
    socket_module.project_rooms.clear()

    ws_client = socketio.test_client(app, headers=auth_headers(app, user_id=3))
    assert ws_client.is_connected()

    ws_client.emit("register", {}, callback=True)

    join_error = ws_client.emit("join_project", {}, callback=True)
    assert join_error["status"] == "error"
    assert join_error["message"] == "Project ID required"

    comment_error = ws_client.emit("comment_added", {"project_id": 1, "task_id": 1}, callback=True)
    assert comment_error["status"] == "error"
    assert comment_error["message"] == "Missing required data"

    project_error = ws_client.emit("project_updated", {}, callback=True)
    assert project_error["status"] == "error"
    assert project_error["message"] == "Project ID required"

    ws_client.disconnect()


def test_dashboard_client_route_returns_computed_task_stats(client, app, monkeypatch):
    from src.db.models import Task, db

    user = SimpleNamespace(
        id=21,
        name="Client User",
        role="developer",
        projects=SimpleNamespace(all=lambda: [SimpleNamespace(id=5, name="Project A", status="active")]),
    )

    due_task = SimpleNamespace(
        id=9,
        title="Due Task",
        deadline=datetime(2099, 1, 1),
        status="in_progress",
        project_id=5,
    )

    class StubUser:
        query = MagicMock()

    StubUser.query.get.return_value = user

    # Counts + recent list now come from DB-side queries (GROUP BY / ORDER BY
    # + LIMIT), so they need real rows — only the due-soon helper stays stubbed.
    with app.app_context():
        db.create_all()
        db.session.add_all(
            [
                Task(id=1, title="One", status="todo", assigned_to=21, created_by=21),
                Task(id=2, title="Two", status="done", assigned_to=21, created_by=21),
                Task(id=3, title="Three", status="completed", assigned_to=21, created_by=21),
            ]
        )
        db.session.commit()

    monkeypatch.setattr(dashboard_controller, "User", StubUser)
    monkeypatch.setattr(dashboard_controller, "get_tasks_due_soon", MagicMock(return_value=[due_task]))

    set_access_cookie(client, app, role="developer", user_id=21)
    response = client.get("/api/v1/dashboard/client")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["tasks"]["total"] == 3
    assert payload["tasks"]["todo"] == 1
    assert payload["tasks"]["done"] == 2
    assert payload["tasks_due_soon"][0]["id"] == 9
    assert payload["projects"][0]["name"] == "Project A"


def test_dashboard_client_route_scopes_team_leads_to_their_projects(client, app, monkeypatch):
    shared_project = SimpleNamespace(id=5, name="Shared Project", status="active", created_by=21)
    created_project = SimpleNamespace(id=8, name="Created Project", status="active", created_by=21)
    user = SimpleNamespace(
        id=21,
        name="Team Lead",
        role="team_lead",
        projects=SimpleNamespace(all=lambda: [shared_project]),
    )

    due_tasks = [SimpleNamespace(id=2, title="Two", deadline=datetime(2099, 1, 7), status="done", project_id=8)]

    class StubUser:
        query = MagicMock()

    class StubProject:
        query = MagicMock()

    StubUser.query.get.return_value = user
    StubProject.query.filter_by.return_value.all.return_value = [created_project]

    # Counts + recent list run real DB-side queries now — seed the rows they
    # read instead of stubbing the model. Only the due-soon helper (unchanged
    # logic) and the link-free activity path stay as they are.
    from src.db.models import Task, db

    with app.app_context():
        db.create_all()
        db.session.add_all(
            [
                Task(
                    id=1,
                    title="One",
                    status="todo",
                    project_id=5,
                    updated_at=datetime(2099, 1, 3),
                    created_at=datetime(2099, 1, 2),
                    created_by=21,
                ),
                Task(
                    id=2,
                    title="Two",
                    status="done",
                    project_id=8,
                    updated_at=datetime(2099, 1, 4),
                    created_at=datetime(2099, 1, 1),
                    created_by=21,
                ),
                Task(
                    id=3,
                    title="Three",
                    status="in_progress",
                    project_id=8,
                    updated_at=datetime(2099, 1, 5),
                    created_at=datetime(2099, 1, 5),
                    created_by=21,
                ),
            ]
        )
        db.session.commit()

    monkeypatch.setattr(dashboard_controller, "User", StubUser)
    monkeypatch.setattr(dashboard_controller, "Project", StubProject)
    monkeypatch.setattr(dashboard_controller, "get_tasks_due_soon", MagicMock(return_value=due_tasks))

    set_access_cookie(client, app, role="team_lead", user_id=21)
    response = client.get("/api/v1/dashboard/client")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["tasks"]["total"] == 3
    assert payload["tasks"]["done"] == 1
    assert [project["name"] for project in payload["projects"]] == ["Shared Project", "Created Project"]
    assert len(payload["recentTasks"]) == 3
    assert payload["tasks_due_soon"][0]["id"] == 2


def test_dashboard_admin_route_returns_user_and_task_totals(client, app, monkeypatch):
    from src.db.models import Task, db

    admin_user = SimpleNamespace(id=1, name="Admin User", role="admin")
    users = [
        SimpleNamespace(role="admin"),
        SimpleNamespace(role="developer"),
        SimpleNamespace(role="team_lead"),
    ]

    class StubUser:
        query = MagicMock()

    class StubProject:
        query = MagicMock()

    StubUser.query.get.return_value = admin_user
    StubUser.query.all.return_value = users
    StubProject.query.count.return_value = 4

    # Task stats run a real .all() now — seed the rows instead of stubbing.
    with app.app_context():
        db.create_all()
        db.session.add_all(
            [
                Task(id=1, title="B", status="backlog", created_by=1, assigned_to=2),
                Task(id=2, title="T", status="todo", created_by=1, assigned_to=2),
                Task(id=3, title="P", status="in_progress", created_by=1, assigned_to=2),
                Task(id=4, title="R", status="review", created_by=1, assigned_to=2),
                Task(id=5, title="D", status="done", created_by=1, assigned_to=2),
                Task(id=6, title="C", status="completed", created_by=1, assigned_to=2),
            ]
        )
        db.session.commit()

    monkeypatch.setattr(dashboard_controller, "User", StubUser)
    monkeypatch.setattr(dashboard_controller, "Project", StubProject)

    set_access_cookie(client, app, role="admin", user_id=1)
    response = client.get("/api/v1/dashboard/admin")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["users"]["total"] == 3
    assert payload["users"]["admin"] == 1
    assert payload["users"]["developer"] == 1
    assert payload["users"]["team_lead"] == 1
    assert payload["tasks"]["total"] == 6
    assert payload["tasks"]["backlog"] == 1
    assert payload["tasks"]["done"] == 2
    assert payload["projects"]["total"] == 4


def test_dashboard_project_route_returns_project_metrics(client, app, monkeypatch):
    from src.db.models import Project, db, project_members

    # The project dashboard now requires membership: seed a real project row
    # plus a membership row (the controller itself stays stubbed below).
    with app.app_context():
        db.create_all()
        db.session.add(Project(id=11, name="Project Delta", description="Important project", status="active", created_by=1))
        db.session.flush()
        db.session.execute(project_members.insert(), [{"project_id": 11, "user_id": 1}])
        db.session.commit()

    project = SimpleNamespace(
        id=11,
        name="Project Delta",
        description="Important project",
        status="active",
        team_members=SimpleNamespace(all=lambda: [SimpleNamespace(id=1, name="Developer One", role="developer")]),
    )

    project_tasks = [
        SimpleNamespace(
            id=1,
            title="Task One",
            status="done",
            assigned_to=1,
            deadline=datetime(2099, 2, 1),
            updated_at=datetime(2099, 1, 1),
        ),
        SimpleNamespace(
            id=2,
            title="Task Two",
            status="todo",
            assigned_to=1,
            deadline=datetime(2099, 2, 2),
            updated_at=datetime(2099, 1, 2),
        ),
    ]

    class StubProject:
        query = MagicMock()

    StubProject.query.get.return_value = project

    monkeypatch.setattr(dashboard_controller, "Project", StubProject)
    monkeypatch.setattr(dashboard_controller, "get_project_tasks", MagicMock(return_value=project_tasks))
    monkeypatch.setattr(dashboard_controller, "get_project_tasks_due_soon", MagicMock(return_value=project_tasks[:1]))
    monkeypatch.setattr(
        dashboard_controller, "get_recent_updated_project_tasks", MagicMock(return_value=project_tasks[:1])
    )

    set_access_cookie(client, app, role="developer", user_id=1)
    response = client.get("/api/v1/dashboard/projects/11")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["project"]["name"] == "Project Delta"
    assert payload["task_stats"]["total"] == 2
    assert payload["task_stats"]["done"] == 1
    assert payload["project"]["completion_percentage"] == 50.0
    assert payload["team_members"][0]["name"] == "Developer One"


def test_logout_revokes_access_token(app):
    from src.auth.token_blocklist import reset_for_tests

    reset_for_tests()
    client = app.test_client()
    token = set_access_cookie(client, app, user_id=501)
    logout_response = client.post("/api/v1/auth/logout", headers=csrf_header(client))
    assert logout_response.status_code == 200

    # Revoked access token is now rejected (fresh client: cookie-only).
    verifier = app.test_client()
    verifier.set_cookie("access_token_cookie", token)
    me_response = verifier.get("/api/v1/auth/me")
    assert me_response.status_code == 401


def test_refresh_rotates_and_old_refresh_rejected(app):
    from src.auth.token_blocklist import reset_for_tests

    reset_for_tests()
    client = app.test_client()
    old_refresh, old_csrf = set_refresh_cookie(client, app, user_id=502)
    first = client.post("/api/v1/auth/refresh", headers={"X-CSRF-TOKEN": old_csrf})
    assert first.status_code == 200

    # Rotation sets a fresh access + refresh cookie pair for the next cycle.
    set_cookies = first.headers.getlist("Set-Cookie")
    assert any("access_token_cookie" in c for c in set_cookies)
    assert any("refresh_token_cookie" in c for c in set_cookies)

    # Old refresh jti is single-use: reuse is rejected (fresh client: cookie-only).
    reuser = app.test_client()
    reuser.set_cookie("refresh_token_cookie", old_refresh)
    reuse = reuser.post("/api/v1/auth/refresh", headers={"X-CSRF-TOKEN": old_csrf})
    assert reuse.status_code == 401


def test_refresh_reuse_revokes_user_tokens(app):
    from src.auth.token_blocklist import reset_for_tests

    reset_for_tests()
    client = app.test_client()
    old_refresh, old_csrf = set_refresh_cookie(client, app, user_id=503)
    rotated = client.post("/api/v1/auth/refresh", headers={"X-CSRF-TOKEN": old_csrf})
    assert rotated.status_code == 200
    rotated_access = client.get_cookie("access_token_cookie").value

    # Reusing the old refresh triggers user-wide revocation (fresh client).
    reuser = app.test_client()
    reuser.set_cookie("refresh_token_cookie", old_refresh)
    reuse = reuser.post("/api/v1/auth/refresh", headers={"X-CSRF-TOKEN": old_csrf})
    assert reuse.status_code == 401

    # The rotated access token (issued before the reuse epoch) is now dead.
    verifier = app.test_client()
    verifier.set_cookie("access_token_cookie", rotated_access)
    stale_response = verifier.get("/api/v1/auth/me")
    assert stale_response.status_code == 401


def test_dashboard_project_route_returns_404_for_missing_project(client, app, monkeypatch):
    class StubProject:
        query = MagicMock()

    StubProject.query.get.return_value = None
    monkeypatch.setattr(dashboard_controller, "Project", StubProject)

    set_access_cookie(client, app, role="developer", user_id=1)
    response = client.get("/api/v1/dashboard/projects/999")

    assert response.status_code == 404
    assert response.get_json()["message"] == "Project not found"
