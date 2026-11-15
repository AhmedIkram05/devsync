"""GET /reports/data: server-side aggregation semantics.

These tests run the real controller against a seeded in-memory DB, so the
assertions cover the SQL (scoping, date window, conditional aggregates,
window-function recent tasks) rather than a mocked query builder.
"""

import os
import sys
from datetime import UTC, datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token, get_csrf_token
from sqlalchemy import event

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.app import create_app
from src.db.models import Project, Task, User, db


@pytest.fixture
def app_and_db(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "testing")
    app, _socketio = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "test-secret-key-for-integration-suite-32",
            "JWT_COOKIE_SECURE": False,
            "JWT_COOKIE_SAMESITE": "Lax",
        }
    )
    with app.app_context():
        db.create_all()
        seed = _seed()
        yield app, seed
        db.session.remove()
        db.drop_all()


def _seed():
    admin = User(name="Admin", email="admin@test.local", password="x", role="admin")
    lead = User(name="Lead", email="lead@test.local", password="x", role="team_lead")
    dev = User(name="Dev", email="dev@test.local", password="x", role="developer")
    outsider = User(name="Out", email="out@test.local", password="x", role="developer")
    db.session.add_all([admin, lead, dev, outsider])
    db.session.flush()

    alpha = Project(name="Alpha", created_by=admin.id, status="active")
    beta = Project(name="Beta", created_by=outsider.id, status="active")
    db.session.add_all([alpha, beta])
    db.session.flush()
    alpha.team_members.append(lead)
    alpha.team_members.append(dev)

    base = datetime.now(UTC)
    old = base - timedelta(days=100)

    def task(title, *, project_id, assigned_to, created_by, status, created_at, deadline=None):
        return Task(
            title=title,
            project_id=project_id,
            assigned_to=assigned_to,
            created_by=created_by,
            status=status,
            created_at=created_at,
            updated_at=created_at,
            deadline=deadline,
        )

    tasks = [
        task(
            "done-in-alpha",
            project_id=alpha.id,
            assigned_to=dev.id,
            created_by=admin.id,
            status="done",
            created_at=base - timedelta(seconds=60),
            deadline=base - timedelta(days=10),
        ),
        task(
            "overdue-in-alpha",
            project_id=alpha.id,
            assigned_to=dev.id,
            created_by=lead.id,
            status="in_progress",
            created_at=base - timedelta(seconds=50),
            deadline=base - timedelta(days=1),
        ),
        task(
            "review-on-lead",
            project_id=alpha.id,
            assigned_to=lead.id,
            created_by=admin.id,
            status="todo",
            created_at=base - timedelta(seconds=40),
            deadline=base + timedelta(days=1),
        ),
        task(
            "outsider-done",
            project_id=beta.id,
            assigned_to=outsider.id,
            created_by=outsider.id,
            status="done",
            created_at=base - timedelta(seconds=30),
        ),
        task(
            "dev-review-unprojected",
            project_id=None,
            assigned_to=dev.id,
            created_by=dev.id,
            status="review",
            created_at=base - timedelta(seconds=20),
            deadline=base - timedelta(days=1),
        ),
        task(
            "old-in-alpha",
            project_id=alpha.id,
            assigned_to=dev.id,
            created_by=admin.id,
            status="todo",
            created_at=old,
        ),
    ]
    db.session.add_all(tasks)
    db.session.commit()

    return {
        "admin_id": admin.id,
        "lead_id": lead.id,
        "dev_id": dev.id,
        "outsider_id": outsider.id,
        "task_ids": {task.title: task.id for task in tasks},
    }


@pytest.fixture
def client(app_and_db):
    app, _seed_data = app_and_db
    return app.test_client()


def _auth(client, app, role, user_id):
    with app.app_context():
        token = create_access_token(identity={"user_id": user_id}, additional_claims={"role": role})
        csrf = get_csrf_token(token)
    client.set_cookie("access_token_cookie", token)
    client.set_cookie("csrf_access_token", csrf)
    return {"X-CSRF-TOKEN": csrf}


def _get(client, app, role, user_id, **params):
    headers = _auth(client, app, role, user_id)
    query = "&".join(f"{key}={value}" for key, value in params.items())
    return client.get(f"/api/v1/reports/data?{query}", headers=headers)


def test_team_lead_week_scope_counts_only_visible_tasks(client, app_and_db):
    app, seed = app_and_db

    response = _get(client, app, "team_lead", seed["lead_id"], type="tasks", date_range="week")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["summary"] == {
        "total": 3,
        "completed": 1,
        "in_progress": 1,
        "overdue": 1,
        "team_members": 4,
    }
    assert payload["meta"]["truncated"] is False
    assert payload["meta"]["row_count"] == 3
    titles = {row["title"] for row in payload["details"]}
    assert titles == {"done-in-alpha", "overdue-in-alpha", "review-on-lead"}


def test_team_lead_year_window_includes_older_tasks(client, app_and_db):
    app, seed = app_and_db

    response = _get(client, app, "team_lead", seed["lead_id"], type="tasks", date_range="year")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["summary"]["total"] == 4
    assert payload["summary"]["completed"] == 1
    assert "old-in-alpha" in {row["title"] for row in payload["details"]}


def test_admin_sees_every_project(client, app_and_db):
    app, seed = app_and_db

    response = _get(client, app, "admin", seed["admin_id"], type="tasks", date_range="week")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["summary"] == {
        "total": 5,
        "completed": 2,
        "in_progress": 1,
        "overdue": 1,
        "team_members": 4,
    }
    assert "outsider-done" in {row["title"] for row in payload["details"]}


def test_details_hydrate_assignee_name_and_are_newest_first(client, app_and_db):
    app, seed = app_and_db

    response = _get(client, app, "admin", seed["admin_id"], type="tasks", date_range="week")

    payload = response.get_json()
    details = payload["details"]
    assert [row["title"] for row in details] == [
        "dev-review-unprojected",
        "outsider-done",
        "review-on-lead",
        "overdue-in-alpha",
        "done-in-alpha",
    ]
    by_title = {row["title"]: row for row in details}
    assert by_title["review-on-lead"]["assignee_name"] == "Lead"
    assert by_title["done-in-alpha"]["assignee_name"] == "Dev"


def test_developers_report_aggregates_every_progress_role(client, app_and_db):
    app, seed = app_and_db

    response = _get(client, app, "admin", seed["admin_id"], type="developers", date_range="week")

    assert response.status_code == 200
    payload = response.get_json()
    # Admin, Dev, Lead, Out (all progress-tracking roles), ordered by name.
    assert [row["name"] for row in payload["details"]] == ["Admin", "Dev", "Lead", "Out"]
    assert payload["summary"] == {
        "developers": 4,
        "avg_tasks": 2,  # 6 tasks / 4 devs = 1.5 -> JS Math.round -> 2
        "avg_completion": 33,  # 2/6 -> 33.33 -> 33
        "active_devs": 2,
    }
    dev = next(row for row in payload["details"] if row["name"] == "Dev")
    assert dev["total_tasks"] == 4
    assert dev["completed_tasks"] == 1
    assert dev["active_tasks"] == 3
    assert [task["title"] for task in dev["recent_tasks"]] == [
        "dev-review-unprojected",
        "overdue-in-alpha",
        "done-in-alpha",
        "old-in-alpha",
    ]


def test_report_uses_at_most_two_select_statements(client, app_and_db):
    app, seed = app_and_db

    with app.app_context():
        engine = db.engine
    statements = []

    def _record(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        tasks_response = _get(client, app, "admin", seed["admin_id"], type="tasks", date_range="week")
        tasks_count = len(statements)
        statements.clear()
        devs_response = _get(client, app, "admin", seed["admin_id"], type="developers", date_range="week")
        devs_count = len(statements)
    finally:
        event.remove(engine, "before_cursor_execute", _record)

    assert tasks_response.status_code == 200
    assert devs_response.status_code == 200
    assert tasks_count == 2
    assert devs_count == 2


@pytest.mark.parametrize(
    ("params", "expected_status"),
    [
        ({"type": "github", "date_range": "week"}, 422),
        ({"type": "nope", "date_range": "week"}, 400),
        ({"type": "tasks", "date_range": "decade"}, 400),
    ],
)
def test_report_validation_rejects_bad_parameters(client, app_and_db, params, expected_status):
    app, seed = app_and_db

    response = _get(client, app, "admin", seed["admin_id"], **params)

    assert response.status_code == expected_status
    assert response.get_json()["status"] == "error"


def test_developer_cannot_request_report_data(client, app_and_db):
    app, seed = app_and_db

    response = _get(client, app, "developer", seed["dev_id"], type="tasks", date_range="week")

    assert response.status_code == 403
