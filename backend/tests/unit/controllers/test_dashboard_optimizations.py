"""Regression tests for the dashboard query optimizations.

Covers the prod-readiness rewrite of the client dashboard:
- status counts come from one DB-side GROUP BY (not Python over .all())
- the recent list is capped in the DB (ORDER BY + LIMIT 50)
- task.project is eager-loaded (no N+1 on serialization)
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch


def _row(**kwargs):
    defaults = {
        "id": 1,
        "title": "T",
        "description": "D",
        "status": "todo",
        "priority": "medium",
        "progress": 0,
        "deadline": None,
        "project_id": 1,
        "project": SimpleNamespace(name="P"),
        "updated_at": None,
        "created_at": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _wire_task_query(mock_task, recent_rows):
    """Wire Task.query.options().filter().order_by().limit().all() chain."""
    options_q = MagicMock()
    filter_q = MagicMock()
    order_q = MagicMock()
    limit_q = MagicMock()
    mock_task.query.options.return_value = options_q
    options_q.filter.return_value = filter_q
    filter_q.order_by.return_value = order_q
    order_q.limit.return_value = limit_q
    limit_q.all.return_value = recent_rows
    return options_q, filter_q, order_q, limit_q


@patch("backend.src.api.controllers.dashboard_controller.joinedload", side_effect=lambda rel: rel)
@patch("backend.src.api.controllers.dashboard_controller.TaskGitHubLink")
@patch("backend.src.api.controllers.dashboard_controller.get_tasks_due_soon", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "developer"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 3})
@patch("backend.src.api.controllers.dashboard_controller.User")
@patch("backend.src.api.controllers.dashboard_controller.Task")
@patch("backend.src.api.controllers.dashboard_controller.db")
def test_client_dashboard_counts_come_from_group_by(
    mock_db, mock_task, mock_user, mock_identity, mock_jwt, mock_due, mock_links, mock_joinedload, app
):
    from backend.src.api.controllers.dashboard_controller import get_client_dashboard

    mock_user.query.get.return_value = SimpleNamespace(
        id=3, name="Dev", role="developer", projects=SimpleNamespace(all=lambda: [])
    )
    mock_db.session.query.return_value.filter.return_value.group_by.return_value.all.return_value = [
        ("todo", 2),
        ("in_progress", 1),
        ("done", 1),
        ("completed", 1),
    ]
    _wire_task_query(mock_task, [_row()])
    link_q = MagicMock()
    mock_links.query.join.return_value = link_q
    link_q.outerjoin.return_value = link_q
    link_q.filter.return_value = link_q
    link_q.options.return_value = link_q
    link_q.order_by.return_value = link_q
    link_q.limit.return_value = link_q
    link_q.all.return_value = []

    with app.app_context():
        data = get_client_dashboard().get_json()

    assert data["taskCounts"]["total"] == 5
    assert data["taskCounts"]["todo"] == 2
    assert data["taskCounts"]["in_progress"] == 1
    # done + completed statuses merge into one bucket
    assert data["taskCounts"]["done"] == 2
    assert data["taskCounts"]["due_soon"] == 0


@patch("backend.src.api.controllers.dashboard_controller.joinedload", side_effect=lambda rel: rel)
@patch("backend.src.api.controllers.dashboard_controller.TaskGitHubLink")
@patch("backend.src.api.controllers.dashboard_controller.get_tasks_due_soon", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "developer"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 3})
@patch("backend.src.api.controllers.dashboard_controller.User")
@patch("backend.src.api.controllers.dashboard_controller.Task")
@patch("backend.src.api.controllers.dashboard_controller.db")
def test_client_dashboard_recent_list_capped_in_db(
    mock_db, mock_task, mock_user, mock_identity, mock_jwt, mock_due, mock_links, mock_joinedload, app
):
    from backend.src.api.controllers.dashboard_controller import get_client_dashboard

    mock_user.query.get.return_value = SimpleNamespace(
        id=3, name="Dev", role="developer", projects=SimpleNamespace(all=lambda: [])
    )
    mock_db.session.query.return_value.filter.return_value.group_by.return_value.all.return_value = []
    _, _, order_q, limit_q = _wire_task_query(mock_task, [_row(id=9)])
    link_q = MagicMock()
    mock_links.query.join.return_value = link_q
    link_q.outerjoin.return_value = link_q
    link_q.filter.return_value = link_q
    link_q.options.return_value = link_q
    link_q.order_by.return_value = link_q
    link_q.limit.return_value = link_q
    link_q.all.return_value = []

    with app.app_context():
        data = get_client_dashboard().get_json()

    # Newest-first page, bounded in the DB — never sorted in Python again.
    order_q.limit.assert_called_once_with(50)
    assert [t["id"] for t in data["recentTasks"]] == [9]
    # Project names serialize without extra queries (eager load applied).
    mock_task.query.options.assert_called()
    assert data["recentTasks"][0]["project_name"] == "P"


@patch("backend.src.api.controllers.dashboard_controller.Task")
def test_get_user_tasks_eager_loads_project(mock_task):
    from backend.src.api.controllers.dashboard_controller import get_user_tasks

    scoped = MagicMock()
    mock_task.query.options.return_value = scoped
    scoped.filter_by.return_value = scoped
    scoped.all.return_value = [_row()]

    with patch(
        "backend.src.api.controllers.dashboard_controller.joinedload", side_effect=lambda rel: rel
    ) as mock_joinedload:
        result = get_user_tasks(1)

    mock_joinedload.assert_called_once_with(mock_task.project)
    mock_task.query.options.assert_called_once()
    assert len(result) == 1
