from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from backend.src.services import task_rules


def test_to_int_valid_and_invalid():
    assert task_rules._to_int("12") == 12
    assert task_rules._to_int(7) == 7
    assert task_rules._to_int("x") is None
    assert task_rules._to_int(None) is None


def test_normalize_task_status():
    assert task_rules.normalize_task_status("In Progress") == "in_progress"
    assert task_rules.normalize_task_status("in-progress") == "in_progress"
    assert task_rules.normalize_task_status(None) == ""


def test_parse_task_deadline_variants():
    now = datetime.now()
    assert task_rules.parse_task_deadline(None) is None
    assert task_rules.parse_task_deadline("") is None
    assert task_rules.parse_task_deadline(now) == now
    assert isinstance(task_rules.parse_task_deadline("2026-05-08T10:00:00"), datetime)
    assert isinstance(task_rules.parse_task_deadline(1735689600), datetime)
    assert isinstance(task_rules.parse_task_deadline(1735689600000), datetime)
    assert task_rules.parse_task_deadline("not-a-date") is None


def test_get_project_scope_ids_non_scope_role_returns_empty():
    assert task_rules.get_project_scope_ids(1, "developer") == set()


def test_get_project_scope_ids_invalid_user_returns_empty():
    assert task_rules.get_project_scope_ids("abc", "admin") == set()


@patch("backend.src.services.task_rules.Project")
def test_get_project_scope_ids_handles_query_error(mock_project):
    mock_project.query.all.side_effect = Exception("db error")
    assert task_rules.get_project_scope_ids(1, "admin") == set()


@patch("backend.src.services.task_rules.Project")
def test_get_project_scope_ids_from_members_and_creator(mock_project):
    project_a = SimpleNamespace(id=10, created_by=99, team_members=[SimpleNamespace(id=1), None])
    project_b = SimpleNamespace(id=20, created_by=1, team_members=[])
    project_c = SimpleNamespace(id=30, created_by=3, team_members=[2, 4])
    project_d = SimpleNamespace(id=None, created_by=1, team_members=[])
    mock_project.query.all.return_value = [project_a, project_b, project_c, project_d]

    assert task_rules.get_project_scope_ids(1, "admin") == {10, 20}


def test_is_task_overdue_false_for_excluded_statuses():
    task = SimpleNamespace(status="done", deadline=datetime.now() - timedelta(days=1))
    assert task_rules.is_task_overdue(task) is False


def test_is_task_overdue_project_scope_mismatch():
    task = SimpleNamespace(status="todo", project_id=3, deadline=datetime.now() - timedelta(days=1))
    assert task_rules.is_task_overdue(task, project_ids={1, 2}) is False


def test_is_task_overdue_assignee_mismatch_with_dict_assignee():
    task = SimpleNamespace(
        status="todo", project_id=1, assignee={"user_id": 22}, deadline=datetime.now() - timedelta(days=1)
    )
    assert task_rules.is_task_overdue(task, assigned_to=99) is False


def test_is_task_overdue_no_deadline():
    task = SimpleNamespace(status="todo", project_id=1)
    assert task_rules.is_task_overdue(task) is False


def test_is_task_overdue_true_for_past_deadline():
    past = datetime.now() - timedelta(hours=1)
    task = SimpleNamespace(status="todo", deadline=past)
    assert task_rules.is_task_overdue(task) is True


def test_is_task_overdue_false_for_future_deadline():
    future = datetime.now() + timedelta(hours=1)
    task = SimpleNamespace(status="todo", deadline=future)
    assert task_rules.is_task_overdue(task) is False


@patch("backend.src.services.task_rules.is_task_overdue")
def test_count_overdue_tasks_uses_predicate(mock_is_task_overdue):
    tasks = [MagicMock(), MagicMock(), MagicMock()]
    mock_is_task_overdue.side_effect = [True, False, True]

    assert task_rules.count_overdue_tasks(tasks, assigned_to=1) == 2
    assert mock_is_task_overdue.call_count == 3
