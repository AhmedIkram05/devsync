"""Notification fan-out is one INSERT ... RETURNING, not one per recipient.

Runs against a real (in-memory) DB so the statement count is measured, not
mocked: a regression back to the per-recipient loop fails the INSERT count.
"""

import os
import sys

import pytest
from sqlalchemy import event

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from src.app import create_app
from src.db.models import User, db
from src.services import notification_service
from src.services.notification_service import NotificationService


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "testing")
    app, _socketio = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "test-secret-key-for-integration-suite-32",
        }
    )
    with app.app_context():
        db.create_all()
        db.session.add_all(
            [
                User(id=1, name="One", email="one@test.local", password="x", role="developer"),
                User(id=2, name="Two", email="two@test.local", password="x", role="developer"),
                User(id=3, name="Three", email="three@test.local", password="x", role="developer"),
            ]
        )
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


def _run_counting_inserts(app, callback):
    with app.app_context():
        engine = db.engine
    statements = []

    def _record(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("INSERT INTO NOTIFICATIONS"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        result = callback()
    finally:
        event.remove(engine, "before_cursor_execute", _record)
    return result, statements


def test_fan_out_issues_exactly_one_insert(app, monkeypatch):
    monkeypatch.setattr(notification_service, "connected_users", {1: {"s1a", "s1b"}, 2: {"s2"}})
    emits = []
    monkeypatch.setattr(
        notification_service.socketio,
        "emit",
        lambda *args, **kwargs: emits.append((args, kwargs)),
    )

    created, statements = _run_counting_inserts(
        app,
        lambda: NotificationService.send_to_recipients([1, 2, 3], "task", "Title", "Message"),
    )

    assert len(statements) == 1
    assert [notification.user_id for notification in created] == [1, 2, 3]
    assert len({notification.created_at for notification in created}) == 1
    assert len(emits) == 3


def test_recipients_are_deduplicated_and_blank_ids_dropped(app):
    created, statements = _run_counting_inserts(
        app,
        lambda: NotificationService.send_to_recipients([1, "1", 2, None, ""], "task", "T", "M"),
    )

    assert len(statements) == 1
    assert [notification.user_id for notification in created] == [1, 2]


def test_empty_recipient_list_skips_the_insert(app):
    created, statements = _run_counting_inserts(
        app,
        lambda: NotificationService.send_to_recipients([], "task", "T", "M"),
    )

    assert created == []
    assert statements == []


def test_send_to_project_uses_the_bulk_path(app, monkeypatch):
    monkeypatch.setattr(NotificationService, "_project_member_ids", lambda project_id: [1, 2, 3])
    sentinel = [object(), object()]

    def fake_bulk(recipient_ids, *args, **kwargs):
        assert recipient_ids == [1, 2]
        return sentinel

    monkeypatch.setattr(NotificationService, "_bulk_create", fake_bulk)

    result = NotificationService.send_to_project(
        project_id=9,
        notification_type="task",
        title="T",
        message="M",
        exclude_user_id=3,
    )

    assert result is sentinel


def test_run_notification_swallows_a_bulk_failure(app, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("queue unavailable")

    monkeypatch.setattr(NotificationService, "_bulk_create", boom)

    # Must not propagate: a notification failure cannot roll back the caller's write.
    notification_service.run_notification(NotificationService.send_to_recipients, [1, 2], "task", "T", "M")
