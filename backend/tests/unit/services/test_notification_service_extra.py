import pytest
from src.services.notification_service import NotificationService


def test_send_to_recipients_empty_returns_empty():
    res = NotificationService.send_to_recipients([], "t", "title", "msg")
    assert res == []


def test_send_to_project_filters_and_calls(monkeypatch):
    # Mock project member ids to include duplicates and strings
    monkeypatch.setattr(NotificationService, "_project_member_ids", lambda pid: [1, "2", 2, 3])

    calls = []

    def fake_send_to_user(**kwargs):
        calls.append(kwargs.get("user_id"))
        return {"id": kwargs.get("user_id")}

    monkeypatch.setattr(NotificationService, "send_to_user", fake_send_to_user)

    notifications = NotificationService.send_to_project(
        project_id=99, notification_type="task", title="t", message="m", exclude_user_id=2, exclude_user_ids=[3]
    )

    # Expect only user 1 to be notified (2 and 3 excluded)
    assert calls == [1]
    assert isinstance(notifications, list)


def test_task_overdue_existing_returns_existing(monkeypatch):
    sentinel = object()

    class Q:
        def filter_by(self, **kwargs):
            class F:
                def first(self_inner):
                    return sentinel

            return F()

    # Provide a Notification object with a .query attribute
    monkeypatch.setattr("src.services.notification_service.Notification", type("N", (), {"query": Q()}))

    res = NotificationService.task_overdue_notification(1, "task", 2, recipient_user_id=5)
    assert res is sentinel
