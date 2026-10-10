"""P0 regression: cross-project disclosure is gated by @require_project_membership."""

import os
import sys

import pytest
from flask_jwt_extended import create_access_token

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.app import create_app
from src.db.models import GitHubRepository, Project, Task, TaskGitHubLink, User, db, project_members


@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "testing")
    app, socketio = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "test-secret-key-for-membership-regression",
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
                User(id=1, name="Member", email="member@example.com", password="x", role="developer"),
                User(id=2, name="Outsider", email="outsider@example.com", password="x", role="developer"),
                User(id=3, name="Admin", email="admin@example.com", password="x", role="admin"),
                Project(id=50, name="Project 50", created_by=1),
                Task(id=10, title="Member task", status="todo", project_id=50, assigned_to=1, created_by=1),
                Task(id=11, title="Outsider task", status="todo", project_id=50, assigned_to=2, created_by=2),
                GitHubRepository(id=70, repo_name="org/fresh", repo_url="https://github.com/org/fresh", github_id=70),
                GitHubRepository(id=71, repo_name="org/linked", repo_url="https://github.com/org/linked", github_id=71),
            ]
        )
        db.session.flush()
        db.session.execute(project_members.insert(), [{"project_id": 50, "user_id": 1}])
        db.session.add(TaskGitHubLink(id=80, task_id=10, repo_id=71))
        db.session.commit()
    return app


def _client_for(app, user_id, role):
    client = app.test_client()
    with app.app_context():
        token = create_access_token(identity={"user_id": user_id}, additional_claims={"role": role})
    client.set_cookie("access_token_cookie", token)
    return client


def test_task_detail_hidden_from_non_member(app, seeded):
    assert _client_for(app, 1, "developer").get("/api/v1/tasks/10").status_code == 200
    assert _client_for(app, 2, "developer").get("/api/v1/tasks/10").status_code == 404
    assert _client_for(app, 3, "admin").get("/api/v1/tasks/10").status_code == 200


def test_task_list_scoped_to_membership(app, seeded):
    member_ids = {t["id"] for t in _client_for(app, 1, "developer").get("/api/v1/tasks").get_json()["tasks"]}
    assert member_ids == {10, 11}

    outsider_ids = {t["id"] for t in _client_for(app, 2, "developer").get("/api/v1/tasks").get_json()["tasks"]}
    assert outsider_ids == {11}

    admin_ids = {t["id"] for t in _client_for(app, 3, "admin").get("/api/v1/tasks").get_json()["tasks"]}
    assert admin_ids == {10, 11}


def test_project_dashboard_requires_membership(app, seeded):
    assert _client_for(app, 1, "developer").get("/api/v1/dashboard/projects/50").status_code == 200
    denied = _client_for(app, 2, "developer").get("/api/v1/dashboard/projects/50")
    assert denied.status_code == 403
    assert _client_for(app, 3, "admin").get("/api/v1/dashboard/projects/50").status_code == 200


def test_linked_repo_issues_require_membership_unlinked_passes(app, seeded):
    # Fresh repo: gate passes (controller then 401s for lack of a GitHub token).
    assert _client_for(app, 2, "developer").get("/api/v1/github/repositories/70/issues").status_code == 401
    # Repo linked to a task in project 50: outsider denied, member passes the gate.
    assert _client_for(app, 2, "developer").get("/api/v1/github/repositories/71/issues").status_code == 403
    assert _client_for(app, 1, "developer").get("/api/v1/github/repositories/71/issues").status_code == 401


def test_task_github_links_require_membership(app, seeded):
    assert _client_for(app, 1, "developer").get("/api/v1/tasks/10/github").status_code == 200
    assert _client_for(app, 2, "developer").get("/api/v1/tasks/10/github").status_code == 404
