"""Dashboard deadline windows key off the *UTC* date.

Deadlines are stored UTC, so a local ``datetime.now()`` near a day boundary
placed a task in the wrong "due soon" / "overdue" window on any non-UTC host.
The stub below deliberately gives a different naive date (2024-01-02) than its
UTC date (2024-01-01): the code must ask for the aware value.
"""

from datetime import UTC, date, datetime
from unittest.mock import MagicMock, patch

from src.api.controllers import dashboard_controller as dc


class _FixedDatetime:
    @classmethod
    def now(cls, tz=None):
        if tz is None:
            return datetime(2024, 1, 2, 1, 0, 0)  # local calendar date 2024-01-02
        return datetime(2024, 1, 1, 23, 0, 0, tzinfo=UTC)  # UTC date 2024-01-01


def test_tasks_due_soon_window_uses_utc_date():
    task_cls = MagicMock()
    with (
        patch.object(dc, "datetime", _FixedDatetime),
        patch.object(dc, "Task", task_cls),
        patch.object(dc, "joinedload", side_effect=lambda rel: rel),
    ):
        dc.get_tasks_due_soon(user_id=1)

    task_cls.deadline.between.assert_called_once_with(date(2024, 1, 1), date(2024, 1, 8))


def test_overdue_window_uses_utc_date():
    task_cls = MagicMock()
    with (
        patch.object(dc, "datetime", _FixedDatetime),
        patch.object(dc, "Task", task_cls),
    ):
        dc._count_overdue_tasks([1, 2])

    task_cls.deadline.__lt__.assert_called_once_with(date(2024, 1, 1))
