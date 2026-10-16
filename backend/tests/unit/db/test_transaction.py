"""Tests for request-scoped transaction management (@transactional)."""

from unittest.mock import MagicMock

import pytest
from flask import Flask, g

from backend.src.db.transaction import commit_or_flush, in_managed_transaction, transactional


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["TESTING"] = True
    return app


def _make_view(body):
    """A @transactional view defined in this module, so the decorator resolves
    the module-level `db` name (patched per-test)."""

    @transactional
    def view(*args, **kwargs):
        return body()

    return view


def test_commits_once_on_success(app, monkeypatch):
    db = MagicMock()
    monkeypatch.setitem(globals(), "db", db)
    view = _make_view(lambda: ({"ok": True}, 201))

    with app.test_request_context():
        result = view()

    assert result == ({"ok": True}, 201)
    db.session.commit.assert_called_once_with()
    db.session.rollback.assert_not_called()


def test_commits_for_plain_dict_response(app, monkeypatch):
    db = MagicMock()
    monkeypatch.setitem(globals(), "db", db)
    view = _make_view(lambda: {"authorization_url": "x"})

    with app.test_request_context():
        view()

    db.session.commit.assert_called_once_with()


def test_rolls_back_and_reraises_on_exception(app, monkeypatch):
    db = MagicMock()
    monkeypatch.setitem(globals(), "db", db)

    def boom():
        raise RuntimeError("db down")

    view = _make_view(boom)

    with app.test_request_context(), pytest.raises(RuntimeError):
        view()

    db.session.rollback.assert_called_once_with()
    db.session.commit.assert_not_called()


def test_does_not_commit_error_response(app, monkeypatch):
    db = MagicMock()
    monkeypatch.setitem(globals(), "db", db)
    view = _make_view(lambda: ({"message": "bad"}, 400))

    with app.test_request_context():
        view()

    db.session.commit.assert_not_called()


def test_flag_is_scoped_and_restored(app, monkeypatch):
    db = MagicMock()
    monkeypatch.setitem(globals(), "db", db)
    seen = {}

    def body():
        seen["inside"] = in_managed_transaction()
        return {}, 200

    view = _make_view(body)

    with app.test_request_context():
        assert in_managed_transaction() is False
        view()
        assert seen["inside"] is True
        assert in_managed_transaction() is False


def test_commit_or_flush_commits_outside_managed_transaction(app):
    db = MagicMock()

    with app.test_request_context():
        commit_or_flush(db)

    db.session.commit.assert_called_once_with()
    db.session.flush.assert_not_called()


def test_commit_or_flush_flushes_inside_managed_transaction(app):
    db = MagicMock()

    with app.test_request_context():
        g.__dict__["_devsync_transaction_managed"] = True
        commit_or_flush(db)

    db.session.flush.assert_called_once_with()
    db.session.commit.assert_not_called()
