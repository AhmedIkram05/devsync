"""Tests for audit controller name resolution."""

from datetime import datetime
from types import SimpleNamespace

import pytest
from src.api.controllers import audit_controller


class FakePagination:
    def __init__(self, items):
        self.items = items
        self.total = len(items)
        self.pages = 1


class FakeQuery:
    def __init__(self, items):
        self.items = items
        self.filters = []
        self.filter_bys = []

    def filter(self, *args, **kwargs):
        self.filters.extend(args)
        return self

    def filter_by(self, **kwargs):
        self.filter_bys.append(kwargs)
        return self

    def order_by(self, *args, **kwargs):
        return self

    def paginate(self, *args, **kwargs):
        return FakePagination(self.items)

    def get_or_404(self, log_id):
        for item in self.items:
            if item.id == log_id:
                return item
        raise LookupError(log_id)


class FakeUserColumn:
    def in_(self, values):
        return values


class FakeAuditColumn:
    """Records the comparisons the controller makes, so tests can assert on filters.

    The date filters use ``column >= value`` / ``column <= value``, so the
    comparison operators must exist or the controller raises TypeError.
    """

    def __init__(self):
        self.comparisons = []

    def desc(self):
        return self

    def ilike(self, value):
        self.comparisons.append(("ilike", value))
        return value

    def __ge__(self, other):
        self.comparisons.append(("gte", other))
        return self

    def __le__(self, other):
        self.comparisons.append(("lte", other))
        return self


class FakeUserQuery:
    def __init__(self, users):
        self.users = users

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self.users

    def get(self, user_id):
        for user in self.users:
            if user.id == user_id:
                return user
        return None


@pytest.fixture
def audit_logs():
    return [
        SimpleNamespace(
            id=1,
            actor_user_id=7,
            actor_role="admin",
            action="user_created",
            resource_type="user",
            resource_id="42",
            ip="127.0.0.1",
            user_agent="pytest",
            metadata_info=None,
            created_at=None,
        )
    ]


@pytest.fixture
def users():
    return [SimpleNamespace(id=7, name="Admin User")]


@pytest.fixture
def fake_models(monkeypatch, audit_logs, users):
    query = FakeQuery(audit_logs)
    created_at = FakeAuditColumn()
    action = FakeAuditColumn()
    monkeypatch.setattr(
        audit_controller,
        "AuditLog",
        SimpleNamespace(query=query, created_at=created_at, action=action),
    )
    monkeypatch.setattr(
        audit_controller,
        "User",
        SimpleNamespace(query=FakeUserQuery(users), id=FakeUserColumn()),
    )
    return SimpleNamespace(query=query, created_at=created_at, action=action)


def test_get_audit_logs_includes_actor_name(app, client, monkeypatch, fake_models):
    with app.test_request_context("/api/v1/admin/audit-logs"):
        response = audit_controller.get_audit_logs()

    assert response.status_code == 200
    data = response.get_json()
    assert data["logs"][0]["actor_name"] == "Admin User"
    assert data["logs"][0]["actor_user_id"] == 7


def test_get_audit_log_by_id_includes_actor_name(app, client, monkeypatch, fake_models):
    with app.test_request_context("/api/v1/admin/audit-logs/1"):
        response = audit_controller.get_audit_log_by_id(1)

    assert response.status_code == 200
    data = response.get_json()
    assert data["log"]["actor_name"] == "Admin User"
    assert data["log"]["actor_user_id"] == 7


def test_build_actor_name_map_short_circuits_when_no_actor_ids(monkeypatch):
    """No actors means no user query at all -- the ``User.query`` lookup is skipped."""
    query = FakeQuery([])
    monkeypatch.setattr(
        audit_controller,
        "User",
        SimpleNamespace(query=FakeUserQuery([]), id=FakeUserColumn()),
    )

    assert audit_controller._build_actor_name_map([]) == {}
    assert query.items == []


def test_build_actor_name_map_ignores_logs_without_actor(monkeypatch, users):
    """A log with a null actor_user_id must not trigger a lookup for ``None``."""
    monkeypatch.setattr(
        audit_controller,
        "User",
        SimpleNamespace(query=FakeUserQuery(users), id=FakeUserColumn()),
    )
    log = SimpleNamespace(actor_user_id=None)

    assert audit_controller._build_actor_name_map([log]) == {}


def test_build_actor_name_map_tolerates_logs_missing_actor_attribute(monkeypatch, users):
    """``getattr`` guard means a detached/detached-projection log cannot crash the map."""
    monkeypatch.setattr(
        audit_controller,
        "User",
        SimpleNamespace(query=FakeUserQuery(users), id=FakeUserColumn()),
    )

    assert audit_controller._build_actor_name_map([object()]) == {}


def test_serialize_audit_log_defaults_actor_map_to_none():
    log = SimpleNamespace(
        id=3,
        actor_user_id=7,
        actor_role="admin",
        action="user_created",
        resource_type="user",
        resource_id="42",
        ip="127.0.0.1",
        user_agent="pytest",
        metadata_info={"a": 1},
        created_at=None,
    )

    payload = audit_controller._serialize_audit_log(log)

    assert payload["actor_name"] is None
    assert payload["metadata"] == {"a": 1}
    assert payload["created_at"] is None


def test_serialize_audit_log_isoformats_created_at():
    log = SimpleNamespace(
        id=3,
        actor_user_id=7,
        actor_role="admin",
        action="user_created",
        resource_type="user",
        resource_id="42",
        ip="127.0.0.1",
        user_agent="pytest",
        metadata_info=None,
        created_at=datetime(2024, 1, 2, 3, 4, 5),
    )

    payload = audit_controller._serialize_audit_log(log, {7: "Admin User"})

    assert payload["created_at"] == "2024-01-02T03:04:05"
    assert payload["actor_name"] == "Admin User"


def test_get_audit_logs_applies_all_filters(app, monkeypatch, fake_models):
    monkeypatch.setattr(audit_controller.settings_service, "cleanup_old_audit_logs", lambda: 0)

    query_string = "?action=created&actor=7&from=2024-01-01&to=2024-12-31"
    with app.test_request_context(f"/api/v1/admin/audit-logs{query_string}"):
        response = audit_controller.get_audit_logs()

    assert response.status_code == 200
    assert fake_models.action.comparisons == [("ilike", "%created%")]
    assert fake_models.created_at.comparisons == [("gte", "2024-01-01"), ("lte", "2024-12-31")]
    assert fake_models.query.filter_bys == [{"actor_user_id": "7"}]


def test_get_audit_logs_passes_pagination_args(app, monkeypatch, fake_models):
    monkeypatch.setattr(audit_controller.settings_service, "cleanup_old_audit_logs", lambda: 0)
    seen = {}

    original_paginate = fake_models.query.paginate

    def recording_paginate(*args, **kwargs):
        seen.update(kwargs)
        return original_paginate(*args, **kwargs)

    monkeypatch.setattr(fake_models.query, "paginate", recording_paginate)

    with app.test_request_context("/api/v1/admin/audit-logs?page=3&per_page=10"):
        response = audit_controller.get_audit_logs()

    assert response.status_code == 200
    assert seen == {"page": 3, "per_page": 10, "error_out": False}
    assert response.get_json()["current_page"] == 3


def test_get_audit_logs_uses_default_pagination(app, monkeypatch, fake_models):
    monkeypatch.setattr(audit_controller.settings_service, "cleanup_old_audit_logs", lambda: 0)
    seen = {}

    original_paginate = fake_models.query.paginate

    def recording_paginate(*args, **kwargs):
        seen.update(kwargs)
        return original_paginate(*args, **kwargs)

    monkeypatch.setattr(fake_models.query, "paginate", recording_paginate)

    with app.test_request_context("/api/v1/admin/audit-logs"):
        audit_controller.get_audit_logs()

    assert seen == {"page": 1, "per_page": 50, "error_out": False}


def test_cleanup_audit_logs_reports_deleted_count(app, monkeypatch):
    monkeypatch.setattr(audit_controller.settings_service, "cleanup_old_audit_logs", lambda: 12)

    with app.test_request_context("/api/v1/admin/audit-logs/cleanup"):
        body, status_code = audit_controller.cleanup_audit_logs()

    assert status_code == 200
    assert body.get_json() == {"message": "Audit log cleanup completed", "deleted": 12}


def test_get_audit_log_by_id_handles_deleted_actor(app, monkeypatch, fake_models):
    """Actor row deleted but log retained: serialize with a null name, not a 500."""
    fake_models.query.items[0].actor_user_id = 999

    with app.test_request_context("/api/v1/admin/audit-logs/1"):
        response = audit_controller.get_audit_log_by_id(1)

    assert response.status_code == 200
    assert response.get_json()["log"]["actor_name"] is None
