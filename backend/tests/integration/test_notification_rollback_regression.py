"""P0 regression: a failing notification must not erase the primary task write.

``run_notification`` used to call a bare ``db.session.rollback()`` on failure.
Inside ``@transactional`` views that rollback also reverted the flushed
task/comment write and the audit record while the API still returned 201/200
(worst case: expired ORM objects re-loaded old values into the success payload).
"""

import os
import sys
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token, get_csrf_token

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.app import create_app
from src.db.models import Notification, Task, User, db
from src.services.notification_service import NotificationService


@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "testing")
    app, socketio = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "test-secret-key-for-notification-rollback",
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
                User(id=1, name="Lead", email="lead@example.com", password="x", role="team_lead"),
                User(id=2, name="Dev", email="dev@example.com", password="x", role="developer"),
                Task(id=10, title="Old title", status="todo", assigned_to=2, created_by=1),
            ]
        )
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


def _poison_notification_write(*args, **kwargs):
    """Write a partial notification row, then fail mid-flight like a real blip."""
    db.session.add(
        Notification(
            user_id=1,
            notification_type="task",
            title="poison",
            message="must be rolled back with the notification only",
            created_at=datetime.now(UTC),
        )
    )
    raise RuntimeError("notification service down")


def test_failed_task_created_notification_keeps_task(app, seeded):
    client, headers = _client_for(app, 1, "team_lead")

    with patch.object(NotificationService, "task_created_notification_v2", _poison_notification_write):
        resp = client.post(
            "/api/v1/tasks",
            headers=headers,
            json={"title": "Saved", "description": "D", "status": "todo"},
        )

    assert resp.status_code == 201
    task_id = resp.get_json()["task"]["id"]
    with app.app_context():
        assert db.session.get(Task, task_id).title == "Saved"
        assert db.session.query(Notification).count() == 0


def test_failed_task_updated_notification_keeps_new_values(app, seeded):
    client, headers = _client_for(app, 1, "team_lead")

    with patch.object(NotificationService, "task_updated_notification_v2", _poison_notification_write):
        resp = client.put("/api/v1/tasks/10", headers=headers, json={"title": "New title"})

    assert resp.status_code == 200
    # The success payload must reflect the new values, not the pre-rollback ones.
    assert resp.get_json()["task"]["title"] == "New title"
    with app.app_context():
        assert db.session.get(Task, 10).title == "New title"
        assert db.session.query(Notification).count() == 0
