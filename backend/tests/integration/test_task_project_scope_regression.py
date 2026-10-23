"""P0 regression: task mutations respect the project-membership boundary.

The list endpoint has always treated project membership as the visibility
boundary (``require_project_membership``), but mutations were wider: any
developer could move their task into any project via ``project_id``, create
tasks into projects they do not belong to, and update/delete tasks assigned to
them in projects they are not a member of. TL/admin mutation scope stays
global by design (semi-intended, kept as-is).
"""

import os
import sys

import pytest
from flask_jwt_extended import create_access_token, get_csrf_token

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.app import create_app
from src.db.models import Project, Task, User, db, project_members


@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "testing")
    app, socketio = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "test-secret-key-for-task-project-scope",
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
def seeded(app):
    with app.app_context():
        db.create_all()
        db.session.add_all(
            [
                User(id=1, name="Dev Member", email="devmember@example.com", password="x", role="developer"),
                User(id=2, name="Dev Outsider", email="devoutsider@example.com", password="x", role="developer"),
                User(id=3, name="Admin", email="admin@example.com", password="x", role="admin"),
                User(id=4, name="TL Outsider", email="tloutsider@example.com", password="x", role="team_lead"),
                User(id=5, name="TL Member", email="tlmember@example.com", password="x", role="team_lead"),
                Project(id=50, name="Home project", created_by=1),
                Project(id=60, name="Other project", created_by=4),
                Task(id=10, title="Assigned to member", status="todo", project_id=50, assigned_to=1, created_by=1),
                Task(id=11, title="Assigned to outsider", status="todo", project_id=50, assigned_to=2, created_by=1),
            ]
        )
        db.session.flush()
        db.session.execute(project_members.insert(), [{"project_id": 50, "user_id": 1}, {"project_id": 50, "user_id": 5}])
        db.session.commit()
    return app


def _client_for(app, user_id, role):
    client = app.test_client()
    with app.app_context():
        token = create_access_token(identity={"user_id": user_id}, additional_claims={"role": role})
        csrf = get_csrf_token(token)
    client.set_cookie("access_token_cookie", token)
    client.set_cookie("csrf_access_token", csrf)
    return client, {"X-CSRF-TOKEN": csrf}


def test_developer_cannot_move_task_cross_project(app, seeded):
    client, headers = _client_for(app, 1, "developer")

    resp = client.put("/api/v1/tasks/10", headers=headers, json={"project_id": 60})

    assert resp.status_code == 403
    with app.app_context():
        assert db.session.get(Task, 10).project_id == 50


def test_developer_assigned_outside_project_cannot_update(app, seeded):
    client, headers = _client_for(app, 2, "developer")

    resp = client.put("/api/v1/tasks/11", headers=headers, json={"status": "done"})

    assert resp.status_code == 403


def test_developer_assigned_outside_project_cannot_delete(app, seeded):
    client, headers = _client_for(app, 2, "developer")

    resp = client.delete("/api/v1/tasks/11", headers=headers)

    assert resp.status_code == 403


def test_project_lead_can_update_task(app, seeded):
    client, headers = _client_for(app, 5, "team_lead")

    resp = client.put("/api/v1/tasks/10", headers=headers, json={"title": "Lead edit"})

    assert resp.status_code == 200
    assert resp.get_json()["task"]["title"] == "Lead edit"


def test_admin_can_update_task(app, seeded):
    client, headers = _client_for(app, 3, "admin")

    resp = client.put("/api/v1/tasks/10", headers=headers, json={"title": "Admin edit"})

    assert resp.status_code == 200


def test_team_lead_global_mutation_scope_unchanged(app, seeded):
    # Semi-intended scope: a TL can still mutate tasks in projects they do not
    # belong to. This test pins that decision so it is a conscious one.
    client, headers = _client_for(app, 4, "team_lead")

    resp = client.put("/api/v1/tasks/10", headers=headers, json={"title": "Global TL edit"})

    assert resp.status_code == 200


def test_non_member_cannot_create_task_into_project(app, seeded):
    client, headers = _client_for(app, 2, "developer")

    resp = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Sneaky", "description": "D", "status": "todo", "project_id": 60},
    )

    assert resp.status_code == 403
    with app.app_context():
        assert db.session.query(Task).filter_by(project_id=60).count() == 0


def test_member_can_create_task_into_own_project(app, seeded):
    client, headers = _client_for(app, 1, "developer")

    resp = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Legit", "description": "D", "status": "todo", "project_id": 50},
    )

    assert resp.status_code == 201


def test_admin_can_create_task_into_any_project(app, seeded):
    client, headers = _client_for(app, 3, "admin")

    resp = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Admin task", "description": "D", "status": "todo", "project_id": 60},
    )

    assert resp.status_code == 201
