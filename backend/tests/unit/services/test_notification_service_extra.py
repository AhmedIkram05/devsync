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
                def first(self):
                    return sentinel

            return F()

    # Provide a Notification object with a .query attribute
    monkeypatch.setattr("src.services.notification_service.Notification", type("N", (), {"query": Q()}))

    res = NotificationService.task_overdue_notification(1, "task", 2, recipient_user_id=5)
    assert res is sentinel


def test_comment_mentions_intersected_with_project_members(monkeypatch):
    """Client-supplied mention ids only reach project members (spam + title
    disclosure gate)."""
    sent_to = []

    monkeypatch.setattr(NotificationService, "_project_member_ids", lambda pid: [3, 4])
    monkeypatch.setattr(
        NotificationService,
        "send_to_user",
        lambda **kwargs: sent_to.append(kwargs.get("user_id")) or {"id": kwargs.get("user_id")},
    )
    monkeypatch.setattr(NotificationService, "send_to_project", lambda **kwargs: [])

    NotificationService.comment_added_notification(
        task_id=1,
        task_name="Secret Task",
        project_id=2,
        comment_id=9,
        commenter_user_id=3,
        mentioned_user_ids=[3, 4, 77],
    )

    # 3 is the commenter (self-mention suppressed), 4 is a member (notified),
    # 77 is not in the project (dropped before any send).
    assert sent_to == [4]


def test_comment_mentions_dropped_entirely_when_lookup_finds_no_members(monkeypatch):
    sent_to = []

    monkeypatch.setattr(NotificationService, "_project_member_ids", lambda pid: [])
    monkeypatch.setattr(
        NotificationService,
        "send_to_user",
        lambda **kwargs: sent_to.append(kwargs.get("user_id")),
    )
    monkeypatch.setattr(NotificationService, "send_to_project", lambda **kwargs: [])

    NotificationService.comment_added_notification(
        task_id=1,
        task_name="Secret Task",
        project_id=2,
        comment_id=9,
        commenter_user_id=3,
        mentioned_user_ids=[77, 88],
    )

    assert sent_to == []
