"""Direct unit tests for the private pure helpers in the tasks/projects controllers.

These are the coercion/serialization helpers that every task and project response
funnels through. They are branchy (``_coerce_int`` passes through anything it
cannot parse, ``_task_datetime`` swallows ``isoformat`` failures) and were only
ever exercised indirectly, through view functions whose behaviour changes
whenever the helpers do.
"""

import builtins
import json
from types import SimpleNamespace
from unittest.mock import Mock

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


def test_task_value_replaces_mock_with_default():
    """MagicMock attributes must not leak into serialized JSON."""
    task = SimpleNamespace(priority=Mock())
    assert tasks_controller._task_value(task, "priority", "medium") == "medium"


def test_task_value_on_bare_mock_returns_default():
    task = Mock()
    assert tasks_controller._task_value(task, "title", "fallback") == "fallback"


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


def test_task_datetime_returns_none_for_mock():
    assert tasks_controller._task_datetime(SimpleNamespace(deadline=Mock()), "deadline") is None


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
    monkeypatch.setattr(tasks_controller.db.session, "rollback", Mock())
    callback = Mock()

    tasks_controller._run_notification(callback, 1, 2, key="v")

    callback.assert_called_once_with(1, 2, key="v")
    tasks_controller.db.session.rollback.assert_not_called()


def test_run_notification_swallows_and_rolls_back(monkeypatch):
    """A failed notification must never fail the task mutation that triggered it."""
    rollback = Mock()
    monkeypatch.setattr(tasks_controller.db.session, "rollback", rollback)

    def boom(*args, **kwargs):
        raise RuntimeError("notification service down")

    tasks_controller._run_notification(boom, 1)  # must not raise

    rollback.assert_called_once()


# --------------------------------------------------------------------------
# _debug_log
# --------------------------------------------------------------------------


@pytest.fixture
def captured_writes(monkeypatch):
    """Capture what _debug_log appends, without touching the real log file."""
    written = []

    class FakeFile:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def write(self, text):
            written.append(text)

    real_open = builtins.open

    def fake_open(path, mode="r", *args, **kwargs):
        if str(path).endswith(".log"):
            return FakeFile()
        return real_open(path, mode, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", fake_open)
    return written


def test_debug_log_writes_structured_payload(captured_writes):
    projects_controller._debug_log(
        "H1",
        "projects_controller.py:get_project_by_id:membership_check",
        "Evaluating membership access",
        {"project_id": 4, "user_id": 1},
    )

    assert len(captured_writes) == 1
    payload = json.loads(captured_writes[0].rstrip("\n"))
    assert payload["sessionId"] == "fb26a3"
    assert payload["runId"] == "initial"
    assert payload["hypothesisId"] == "H1"
    assert payload["location"] == "projects_controller.py:get_project_by_id:membership_check"
    assert payload["message"] == "Evaluating membership access"
    assert payload["data"] == {"project_id": 4, "user_id": 1}
    assert isinstance(payload["timestamp"], int)
    assert payload["id"].startswith("log_")


def test_debug_log_honours_run_id(captured_writes):
    projects_controller._debug_log("H2", "loc", "msg", {}, run_id="verify")

    payload = json.loads(captured_writes[0].rstrip("\n"))
    assert payload["runId"] == "verify"


def test_debug_log_never_raises_when_path_unwritable(monkeypatch):
    """Logging is best-effort: a failed write must not break the request."""

    def exploding_open(*args, **kwargs):
        raise OSError("read-only filesystem")

    monkeypatch.setattr(builtins, "open", exploding_open)

    projects_controller._debug_log("H3", "loc", "msg", {})


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
