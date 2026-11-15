"""RBAC lookups are memoized per request, never across requests.

A cross-request or cross-pod cache would introduce an authorization staleness
window; these tests pin the request-scoped-only contract and the query counts.
"""

import os
import sys

import pytest
from sqlalchemy import event

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from src.app import create_app
from src.auth.rbac import _is_project_member_or_creator, get_user_project_ids
from src.db.models import Project, User, db


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
    # Seed in a throwaway context: holding one app context for the whole test
    # would also reuse ``g`` across test_request_context blocks, hiding the
    # per-request cache reset we are asserting.
    with app.app_context():
        db.create_all()
        owner = User(name="Owner", email="owner@test.local", password="x", role="admin")
        member = User(name="Member", email="member@test.local", password="x", role="developer")
        outsider = User(name="Outsider", email="outsider@test.local", password="x", role="developer")
        db.session.add_all([owner, member, outsider])
        db.session.flush()

        project = Project(name="Alpha", created_by=owner.id)
        db.session.add(project)
        db.session.flush()
        project.team_members.append(member)
        db.session.commit()
        seed = {
            "owner": owner.id,
            "member": member.id,
            "outsider": outsider.id,
            "project": project.id,
        }
        db.session.remove()

    yield app, seed

    with app.app_context():
        db.drop_all()


class _Counter:
    def __init__(self):
        self.statements = []

    def __enter__(self):
        self._engine = db.engine
        event.listen(self._engine, "before_cursor_execute", self._record)
        return self

    def __exit__(self, *exc):
        event.remove(self._engine, "before_cursor_execute", self._record)

    def _record(self, _conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            self.statements.append(statement)

    @property
    def count(self):
        return len(self.statements)


def test_project_ids_are_memoized_within_one_request(app):
    app, ids = app

    with app.test_request_context("/"):
        with _Counter() as counter:
            first = get_user_project_ids(ids["member"])
            second = get_user_project_ids(ids["member"])

    assert first == second == {ids["project"]}
    # members query + created-projects query, once for both calls.
    assert counter.count == 2


def test_project_ids_are_refetched_in_a_new_request(app):
    app, ids = app

    with app.test_request_context("/"):
        with _Counter() as first_counter:
            get_user_project_ids(ids["member"])

    with app.test_request_context("/"):
        with _Counter() as second_counter:
            get_user_project_ids(ids["member"])

    assert first_counter.count == 2
    assert second_counter.count == 2


def test_membership_is_memoized_within_one_request(app):
    app, ids = app

    with app.test_request_context("/"):
        with _Counter() as counter:
            assert _is_project_member_or_creator(ids["member"], ids["project"]) is True
            after_first = counter.count
            assert _is_project_member_or_creator(ids["member"], ids["project"]) is True
            assert counter.count == after_first

    assert after_first >= 1


def test_negative_membership_is_memoized_too(app):
    app, ids = app

    with app.test_request_context("/"):
        with _Counter() as counter:
            assert _is_project_member_or_creator(ids["outsider"], ids["project"]) is False
            after_first = counter.count
            assert _is_project_member_or_creator(ids["outsider"], ids["project"]) is False
            assert counter.count == after_first

    assert after_first >= 1


def test_cache_keys_do_not_collide_between_users(app):
    app, ids = app

    with app.test_request_context("/"):
        assert get_user_project_ids(ids["member"]) == {ids["project"]}
        assert get_user_project_ids(ids["outsider"]) == set()

        assert _is_project_member_or_creator(ids["member"], ids["project"]) is True
        assert _is_project_member_or_creator(ids["outsider"], ids["project"]) is False


def test_lookups_still_work_outside_a_request_context(app):
    app, ids = app

    with app.app_context():
        assert get_user_project_ids(ids["member"]) == {ids["project"]}
        assert _is_project_member_or_creator(ids["member"], ids["project"]) is True
