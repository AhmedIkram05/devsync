"""Direct unit tests for the private pure helpers in the tasks/projects controllers.

These are the coercion/serialization helpers that every task and project response
funnels through. They are branchy (``_coerce_int`` passes through anything it
cannot parse, ``_task_datetime`` swallows ``isoformat`` failures) and were only
ever exercised indirectly, through view functions whose behaviour changes
whenever the helpers do.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import pytest
from src.api.controllers import projects_controller, tasks_controller


class ExplodingDatetime:
    """A non-Mock object whose isoformat() blows up."""

    def isoformat(self):
        raise ValueError("boom")


class FakeRelationship:
    def __init__(self, items):
        self.items = items
        self.all_calls = 0

    def all(self):
        self.all_calls += 1
        return self.items


# --------------------------------------------------------------------------
# _coerce_int
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, None),
        ("", None),
        (7, 7),
        (0, 0),
        ("42", 42),
        ("0", 0),
        # Not parseable as a non-negative int -> passed through untouched so the
        # validator layer can produce the 400, rather than silently zeroing.
        ("-3", "-3"),
        ("abc", "abc"),
        (" 42 ", " 42 "),
        ("4.0", "4.0"),
        (3.7, 3.7),
        ([1], [1]),
    ],
)
def test_coerce_int(value, expected):
    assert tasks_controller._coerce_int(value) == expected


def test_coerce_int_preserves_bool_identity():
    # bool is a subclass of int; short-circuits before the isdigit() branch.
    assert tasks_controller._coerce_int(True) is True


def test_coerce_int_never_raises_on_odd_input():
    for value in (object(), {"a": 1}, b"12"):
        assert tasks_controller._coerce_int(value) == value


# --------------------------------------------------------------------------
# _task_value
# --------------------------------------------------------------------------


def test_task_value_returns_present_attribute():
    task = SimpleNamespace(title="Ship it", progress=40)
    assert tasks_controller._task_value(task, "title") == "Ship it"
    assert tasks_controller._task_value(task, "progress") == 40


def test_task_value_falls_back_to_default_when_absent():
    task = SimpleNamespace(title="Ship it")
    assert tasks_controller._task_value(task, "priority", "medium") == "medium"
    assert tasks_controller._task_value(task, "priority") is None


def test_task_value_keeps_explicit_none_over_default():
    task = SimpleNamespace(priority=None)
    assert tasks_controller._task_value(task, "priority", "medium") is None


# --------------------------------------------------------------------------
# _task_datetime
# --------------------------------------------------------------------------


def test_task_datetime_isoformats_real_datetime():
    from datetime import datetime

    task = SimpleNamespace(deadline=datetime(2024, 3, 4, 5, 6, 7))
    assert tasks_controller._task_datetime(task, "deadline") == "2024-03-04T05:06:07"


def test_task_datetime_returns_none_for_missing_field():
    assert tasks_controller._task_datetime(SimpleNamespace(), "deadline") is None


def test_task_datetime_returns_none_for_explicit_none():
    assert tasks_controller._task_datetime(SimpleNamespace(deadline=None), "deadline") is None


def test_task_datetime_swallows_isoformat_failure():
    assert tasks_controller._task_datetime(SimpleNamespace(deadline=ExplodingDatetime()), "deadline") is None


def test_task_datetime_passes_through_non_datetime_value():
    task = SimpleNamespace(deadline="2024-03-04")
    assert tasks_controller._task_datetime(task, "deadline") == "2024-03-04"


def test_task_datetime_passes_through_epoch_int():
    task = SimpleNamespace(created_at=1700000000)
    assert tasks_controller._task_datetime(task, "created_at") == 1700000000


# --------------------------------------------------------------------------
# _run_notification
# --------------------------------------------------------------------------


def test_run_notification_invokes_callback(monkeypatch):
    savepoint = MagicMock()
    monkeypatch.setattr(tasks_controller.db.session, "begin_nested", Mock(return_value=savepoint))
    monkeypatch.setattr(tasks_controller.db.session, "rollback", Mock())
    callback = Mock()

    tasks_controller._run_notification(callback, 1, 2, key="v")

    callback.assert_called_once_with(1, 2, key="v")
    tasks_controller.db.session.begin_nested.assert_called_once_with()
    tasks_controller.db.session.rollback.assert_not_called()


def test_run_notification_swallows_and_rolls_back_to_savepoint(monkeypatch):
    """A failed notification must never roll back the task mutation that triggered it."""
    rollback = Mock()
    savepoint = MagicMock()
    monkeypatch.setattr(tasks_controller.db.session, "begin_nested", Mock(return_value=savepoint))
    monkeypatch.setattr(tasks_controller.db.session, "rollback", rollback)

    def boom(*args, **kwargs):
        raise RuntimeError("notification service down")

    tasks_controller._run_notification(boom, 1)  # must not raise

    tasks_controller.db.session.begin_nested.assert_called_once_with()
    rollback.assert_not_called()


# --------------------------------------------------------------------------
# _relationship_items
# --------------------------------------------------------------------------


def test_relationship_items_returns_empty_list_for_none():
    assert projects_controller._relationship_items(None) == []


def test_relationship_items_calls_all_on_query():
    relationship = FakeRelationship(["a", "b"])
    assert projects_controller._relationship_items(relationship) == ["a", "b"]
    assert relationship.all_calls == 1


def test_relationship_items_materialises_plain_iterables():
    assert projects_controller._relationship_items(("a", "b")) == ["a", "b"]
    assert projects_controller._relationship_items(iter([1, 2])) == [1, 2]
