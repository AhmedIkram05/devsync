"""Tests for audit controller name resolution."""

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

    def filter(self, *args, **kwargs):
        return self

    def filter_by(self, *args, **kwargs):
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
    def desc(self):
        return self

    def ilike(self, value):
        return value


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
    monkeypatch.setattr(
        audit_controller,
        "AuditLog",
        SimpleNamespace(query=FakeQuery(audit_logs), created_at=FakeAuditColumn(), action=FakeAuditColumn()),
    )
    monkeypatch.setattr(
        audit_controller,
        "User",
        SimpleNamespace(query=FakeUserQuery(users), id=FakeUserColumn()),
    )


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
