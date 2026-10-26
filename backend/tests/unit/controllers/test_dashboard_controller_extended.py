from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


def _task(**kwargs):
    defaults = {
        "id": 1,
        "title": "Task",
        "description": "Desc",
        "status": "todo",
        "priority": "medium",
        "progress": 20,
        "deadline": None,
        "project_id": 1,
        "project": None,
        "updated_at": None,
        "created_at": None,
        "assigned_to": 1,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _route_db_query(
    mock_db,
    mock_task,
    mock_user,
    *,
    task_status_rows=(),
    user_role_rows=(),
    project_task_rows=(),
    team_lead_project_rows=(),
    mock_project=None,
):
    """Route db.session.query(col, ...) aggregate calls by their first column."""
    task_status_q = MagicMock()
    task_status_q.group_by.return_value.all.return_value = list(task_status_rows)

    user_role_q = MagicMock()
    user_role_q.group_by.return_value.all.return_value = list(user_role_rows)

    project_task_q = MagicMock()
    project_task_q.filter.return_value.group_by.return_value.all.return_value = list(project_task_rows)

    team_lead_q = MagicMock()
    team_lead_q.outerjoin.return_value.filter.return_value.all.return_value = list(team_lead_project_rows)

    def router(*args):
        first = args[0]
        if first is mock_task.status:
            return task_status_q
        if first is mock_user.role:
            return user_role_q
        if first is mock_task.project_id:
            return project_task_q
        if mock_project is not None and first is mock_project.id:
            return team_lead_q
        return MagicMock()

    mock_db.session.query.side_effect = router


def test_dashboard_helpers_basic():
    from backend.src.api.controllers import dashboard_controller as dc

    assert dc._is_completed_status("done") is True
    assert dc._is_completed_status("completed") is True
    assert dc._is_completed_status("todo") is False
    assert dc._is_completed_task(SimpleNamespace(status="completed")) is True


@patch("backend.src.api.controllers.dashboard_controller.User")
def test_safe_query_all_error_returns_empty(mock_user):
    from backend.src.api.controllers.dashboard_controller import _safe_query_all

    mock_user.query.all.side_effect = Exception("db fail")
    assert _safe_query_all(mock_user) == []


def test_task_to_dashboard_item_and_github_activity_item():
    from backend.src.api.controllers.dashboard_controller import _github_activity_to_item, _task_to_dashboard_item

    now = datetime.now()
    task = _task(deadline=now, created_at=now, updated_at=now, project=SimpleNamespace(name="Alpha"))
    item = _task_to_dashboard_item(task)
    assert item["project_name"] == "Alpha"
    assert item["deadline"] == now.isoformat()

    link = SimpleNamespace(
        id=1,
        pull_request_number=12,
        issue_number=None,
        created_at=now,
        task=SimpleNamespace(title="Linked Task"),
        repository=SimpleNamespace(repo_name="org/repo", repo_url="https://github.com/org/repo"),
    )
    activity = _github_activity_to_item(link)
    assert activity["type"] == "pull_request"
    assert activity["label"] == "#12"
    assert activity["url"].endswith("/pull/12")


@patch("backend.src.api.controllers.dashboard_controller.Task")
def test_get_user_tasks_and_project_tasks_error_paths(mock_task):
    from backend.src.api.controllers.dashboard_controller import get_project_tasks, get_user_tasks

    mock_task.query.filter_by.side_effect = Exception("db fail")
    assert get_user_tasks(1) == []
    assert get_project_tasks(10) == []


@patch("backend.src.api.controllers.dashboard_controller.joinedload", side_effect=lambda rel: rel)
@patch("backend.src.api.controllers.dashboard_controller.Task")
def test_get_tasks_due_soon_filters_user_and_project(mock_task, mock_joinedload):
    from backend.src.api.controllers.dashboard_controller import get_tasks_due_soon

    final_query = MagicMock()
    q3 = MagicMock()
    q2 = MagicMock()
    q1 = MagicMock()
    mock_task.query.filter.return_value = q1
    q1.filter.return_value = q2
    q2.filter.return_value = q3
    q3.filter.return_value = final_query
    final_query.options.return_value = final_query
    final_query.all.return_value = [_task()]

    assert len(get_tasks_due_soon(user_id=9)) == 1

    final_query2 = MagicMock()
    q3.filter.return_value = final_query2
    final_query2.options.return_value = final_query2
    final_query2.all.return_value = [_task(project_id=7)]
    assert len(get_tasks_due_soon(project_ids={7})) == 1


@patch("backend.src.api.controllers.dashboard_controller.Task")
def test_get_tasks_due_soon_handles_exception(mock_task):
    from backend.src.api.controllers.dashboard_controller import get_tasks_due_soon

    mock_task.query.filter.side_effect = Exception("boom")
    assert get_tasks_due_soon(user_id=1) == []


@patch("backend.src.api.controllers.dashboard_controller.Task")
def test_get_recent_completed_tasks_error_path(mock_task):
    from backend.src.api.controllers.dashboard_controller import get_recent_completed_tasks

    mock_task.query.filter_by.side_effect = Exception("boom")
    assert get_recent_completed_tasks(1, "month") == []


@patch("backend.src.api.controllers.dashboard_controller.Task")
def test_get_project_task_helpers(mock_task):
    from backend.src.api.controllers.dashboard_controller import (
        get_project_tasks_due_soon,
        get_recent_updated_project_tasks,
    )

    q4 = MagicMock()
    q3 = MagicMock()
    q2 = MagicMock()
    q1 = MagicMock()
    mock_task.query.filter_by.return_value = q1
    q1.filter.return_value = q2
    q2.filter.return_value = q3
    q3.filter.return_value = q4
    q4.all.return_value = [_task()]
    assert len(get_project_tasks_due_soon(1)) == 1

    order_q = MagicMock()
    limit_q = MagicMock()
    mock_task.query.filter_by.return_value = q1
    q1.order_by.return_value = order_q
    order_q.limit.return_value = limit_q
    limit_q.all.return_value = [_task(id=2)]
    assert len(get_recent_updated_project_tasks(1)) == 1


@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "developer"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 1})
@patch("backend.src.api.controllers.dashboard_controller.User")
def test_get_user_dashboard_user_not_found(mock_user, mock_identity, mock_jwt, app):
    mock_user.query.get.return_value = None

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_user_dashboard

        response, status = get_user_dashboard()

    assert status == 404
    assert response.get_json()["message"] == "User not found"


@patch("backend.src.api.controllers.dashboard_controller.get_recent_completed_tasks", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.get_tasks_due_soon", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.get_user_tasks", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "developer"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 1})
@patch("backend.src.api.controllers.dashboard_controller.User")
def test_get_user_dashboard_success(
    mock_user,
    mock_identity,
    mock_jwt,
    mock_get_user_tasks,
    mock_due_soon,
    mock_completed,
    app,
):
    user = SimpleNamespace(
        id=1,
        name="Dev",
        role="developer",
        projects=SimpleNamespace(all=lambda: [SimpleNamespace(id=1, name="P1", status="active")]),
    )
    mock_user.query.get.return_value = user

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_user_dashboard

        response = get_user_dashboard()
        data = response.get_json()

    assert data["user"]["id"] == 1
    assert data["tasks"]["assigned_count"] == 0
    assert len(data["projects"]) == 1


@patch("backend.src.api.controllers.dashboard_controller.Project")
@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "team_lead"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 2})
@patch("backend.src.api.controllers.dashboard_controller.User")
@patch("backend.src.api.controllers.dashboard_controller.TaskGitHubLink")
@patch("backend.src.api.controllers.dashboard_controller.Task")
def test_get_client_dashboard_team_lead_success(
    mock_task,
    mock_link,
    mock_user,
    mock_identity,
    mock_jwt,
    mock_project,
    app,
):
    user = SimpleNamespace(
        id=2,
        projects=SimpleNamespace(all=lambda: [SimpleNamespace(id=10, name="P1", status="active")]),
    )
    mock_user.query.get.return_value = user
    mock_project.query.filter_by.return_value.all.return_value = [SimpleNamespace(id=11, name="P2", status="active")]

    mock_task.query.filter.return_value.all.return_value = [_task(project_id=10)]

    link_q = MagicMock()
    mock_link.query.join.return_value = link_q
    link_q.outerjoin.return_value = link_q
    link_q.filter.return_value = link_q
    link_q.order_by.return_value = link_q
    link_q.limit.return_value = link_q
    link_q.all.return_value = []

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_client_dashboard

        response = get_client_dashboard()
        data = response.get_json()

    assert "taskCounts" in data
    assert len(data["projects"]) == 2


@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "developer"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 2})
@patch("backend.src.api.controllers.dashboard_controller.User")
def test_get_client_dashboard_user_not_found(mock_user, mock_identity, mock_jwt, app):
    mock_user.query.get.return_value = None

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_client_dashboard

        response, status = get_client_dashboard()

    assert status == 404


@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "developer"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 2})
def test_get_admin_dashboard_unauthorized(mock_identity, mock_jwt, app):
    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_admin_dashboard

        response, status = get_admin_dashboard()

    assert status == 403


@patch("backend.src.api.controllers.dashboard_controller.get_project_scope_ids", return_value=set())
@patch("backend.src.api.controllers.dashboard_controller.joinedload", side_effect=lambda rel: rel)
@patch("backend.src.api.controllers.dashboard_controller.Project")
@patch("backend.src.api.controllers.dashboard_controller.Task")
@patch("backend.src.api.controllers.dashboard_controller.User")
@patch("backend.src.api.controllers.dashboard_controller.db")
@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "admin"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 1})
def test_get_admin_dashboard_success(
    mock_identity,
    mock_jwt,
    mock_db,
    mock_user,
    mock_task,
    mock_project,
    mock_joinedload,
    mock_scope,
    app,
):
    mock_user.query.get.return_value = SimpleNamespace(id=1)
    _route_db_query(
        mock_db,
        mock_task,
        mock_user,
        task_status_rows=[("todo", 1), ("done", 1), ("completed", 1)],
        user_role_rows=[("admin", 1)],
        project_task_rows=[(1, 2)],
    )

    now = datetime.now()
    task = _task(status="todo", updated_at=now, created_at=now, assigned_to=1)
    assigned_q = mock_task.query.options.return_value
    assigned_q.filter_by.return_value.order_by.return_value.limit.return_value.all.return_value = [task]

    # Admin overdue count is a separate scoped .filter().filter().count() query.
    mock_task.query.filter.return_value.filter.return_value.count.return_value = 0

    project = SimpleNamespace(id=1, name="P1", status="active", created_at=now, updated_at=now)
    mock_project.query.count.return_value = 1
    recent_q = MagicMock()
    limit_q = MagicMock()
    mock_project.query.order_by.return_value = recent_q
    recent_q.limit.return_value = limit_q
    limit_q.all.return_value = [project]

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_admin_dashboard

        response = get_admin_dashboard()
        data = response.get_json()

    assert data["users"]["total"] == 1
    assert data["users"]["admin"] == 1
    assert data["tasks"]["total"] == 3
    assert data["tasks"]["todo"] == 1
    # "done" and "completed" merge into one bucket.
    assert data["tasks"]["done"] == 2
    assert data["tasks"]["overdue"] == 0
    assert data["projects"]["total"] == 1
    assert len(data["my_assigned_tasks"]) == 1
    assert data["recentProjects"][0]["task_count"] == 2
    assert "team_lead_kpis" not in data


@patch("backend.src.api.controllers.dashboard_controller.Project")
def test_get_project_dashboard_not_found(mock_project, app):
    mock_project.query.get.return_value = None

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_project_dashboard

        response, status = get_project_dashboard(99)

    assert status == 404


@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "admin"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 1})
@patch("backend.src.api.controllers.dashboard_controller.get_tasks_due_soon", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.get_recent_completed_tasks", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.User")
@patch("backend.src.api.controllers.dashboard_controller.db")
def test_get_user_dashboard_counts_from_group_by(
    mock_db, mock_user, mock_identity, mock_jwt, mock_completed, mock_due, app
):
    """The user dashboard's task counts come from GROUP BY queries, one per scope."""
    from backend.src.api.controllers.dashboard_controller import get_user_dashboard

    mock_user.query.get.return_value = SimpleNamespace(
        id=1, name="Admin", role="admin", projects=SimpleNamespace(all=lambda: [])
    )

    assigned_q = MagicMock()
    assigned_q.filter.return_value.group_by.return_value.all.return_value = [("todo", 1), ("done", 2)]
    team_q = MagicMock()
    team_q.join.return_value.filter.return_value.group_by.return_value.all.return_value = [
        ("todo", 1),
        ("in_progress", 2),
        ("done", 1),
    ]
    # Called in order: assigned counts, then the admin-created team counts.
    mock_db.session.query.side_effect = [assigned_q, team_q]

    with app.app_context():
        data = get_user_dashboard().get_json()

    assert data["tasks"]["assigned_count"] == 3
    assert data["tasks"]["pending_count"] == 1
    assert data["tasks"]["completed_count"] == 2
    assert data["team"]["total_tasks"] == 4
    assert data["team"]["completed_tasks"] == 1
    assert data["team"]["in_progress_tasks"] == 2
    assert data["team"]["pending_tasks"] == 1


@patch("backend.src.api.controllers.dashboard_controller.db")
def test_team_lead_project_ids_single_membership_join(mock_db, app):
    """TL scoping is one membership join — the Project.query.all() N+1 is gone."""
    from backend.src.api.controllers import dashboard_controller as dc

    join_q = MagicMock()
    join_q.outerjoin.return_value.filter.return_value.all.return_value = [(10,), (11,)]
    mock_db.session.query.return_value = join_q

    assert dc._team_lead_project_ids(2) == [10, 11]
    # Exactly one aggregate query serves the whole scoping decision.
    mock_db.session.query.assert_called_once()


@patch("backend.src.api.controllers.dashboard_controller.joinedload", side_effect=lambda rel: rel)
@patch("backend.src.api.controllers.dashboard_controller.TaskGitHubLink")
@patch("backend.src.api.controllers.dashboard_controller.get_tasks_due_soon", return_value=[_task(id=5)])
@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "developer"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 3})
@patch("backend.src.api.controllers.dashboard_controller.User")
@patch("backend.src.api.controllers.dashboard_controller.Task")
@patch("backend.src.api.controllers.dashboard_controller.db")
def test_client_dashboard_has_single_due_soon_payload(
    mock_db, mock_task, mock_user, mock_identity, mock_jwt, mock_due, mock_links, mock_joinedload, app
):
    """The client dashboard serializes due-soon tasks once (upcomingDeadlines)."""
    from backend.src.api.controllers.dashboard_controller import get_client_dashboard

    mock_user.query.get.return_value = SimpleNamespace(
        id=3, name="Dev", role="developer", projects=SimpleNamespace(all=lambda: [])
    )
    mock_db.session.query.return_value.filter.return_value.group_by.return_value.all.return_value = [("todo", 1)]
    # Wire Task.query.options().filter().order_by().limit().all() for the recent list.
    options_q = MagicMock()
    filter_q = MagicMock()
    order_q = MagicMock()
    limit_q = MagicMock()
    mock_task.query.options.return_value = options_q
    options_q.filter.return_value = filter_q
    filter_q.order_by.return_value = order_q
    order_q.limit.return_value = limit_q
    limit_q.all.return_value = []
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

    assert "tasks_due_soon" not in data
    assert [item["id"] for item in data["upcomingDeadlines"]] == [5]


@patch("backend.src.api.controllers.dashboard_controller.get_recent_updated_project_tasks", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.get_project_tasks_due_soon", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.get_project_tasks")
@patch("backend.src.api.controllers.dashboard_controller.Project")
def test_get_project_dashboard_success(mock_project, mock_get_tasks, mock_due, mock_recent, app):
    project = SimpleNamespace(
        id=5,
        name="Proj",
        description="D",
        status="active",
        team_members=SimpleNamespace(all=lambda: [SimpleNamespace(id=2, name="A", role="developer")]),
    )
    mock_project.query.get.return_value = project
    mock_get_tasks.return_value = [_task(status="done"), _task(status="todo")]

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_project_dashboard

        response = get_project_dashboard(5)
        data = response.get_json()

    assert data["project"]["completion_percentage"] == 50.0
    assert data["task_stats"]["done"] == 1
    assert len(data["team_members"]) == 1


@patch("backend.src.api.controllers.dashboard_controller.TaskGitHubLink")
@patch("backend.src.api.controllers.dashboard_controller.get_tasks_due_soon", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.get_user_tasks", return_value=[_task(status="todo")])
@patch("backend.src.api.controllers.dashboard_controller.joinedload", side_effect=lambda rel: rel)
@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "developer"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 3})
@patch("backend.src.api.controllers.dashboard_controller.User")
@patch("backend.src.api.controllers.dashboard_controller.db")
def test_get_client_dashboard_developer_path_with_github_activity_error(
    mock_db,
    mock_user,
    mock_identity,
    mock_jwt,
    mock_joinedload,
    mock_get_user_tasks,
    mock_due_soon,
    mock_links,
    app,
):
    user = SimpleNamespace(
        id=3,
        name="Dev",
        role="developer",
        projects=SimpleNamespace(all=lambda: []),
    )
    mock_user.query.get.return_value = user
    # Counts now come from one GROUP BY, not from the mocked helper's list.
    mock_db.session.query.return_value.filter.return_value.group_by.return_value.all.return_value = [("todo", 1)]

    link_query = MagicMock()
    mock_links.query.join.return_value = link_query
    link_query.outerjoin.return_value = link_query
    link_query.filter.side_effect = Exception("github query failed")

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_client_dashboard

        response = get_client_dashboard()
        data = response.get_json()

    assert data["taskCounts"]["total"] == 1
    assert data["githubActivity"] == []
    assert len(data["projects"]) == 0


@patch("backend.src.api.controllers.dashboard_controller.get_project_scope_ids", return_value=set())
@patch("backend.src.api.controllers.dashboard_controller.Project")
@patch("backend.src.api.controllers.dashboard_controller.Task")
@patch("backend.src.api.controllers.dashboard_controller.User")
@patch("backend.src.api.controllers.dashboard_controller.db")
@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "admin"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 1})
def test_get_admin_dashboard_handles_query_fallbacks(
    mock_identity,
    mock_jwt,
    mock_db,
    mock_user,
    mock_task,
    mock_project,
    mock_scope,
    app,
):
    mock_user.query.get.return_value = SimpleNamespace(id=1)
    # Aggregations share one session factory: failing it degrades both counts to zero.
    mock_db.session.query.side_effect = Exception("db unavailable")
    mock_task.query.filter.return_value.filter.return_value.count.return_value = 0
    assigned_q = mock_task.query.options.return_value
    assigned_q.filter_by.return_value.order_by.return_value.limit.return_value.all.return_value = []
    mock_project.query.count.return_value = 0
    mock_project.query.order_by.side_effect = Exception("recent projects unavailable")

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_admin_dashboard

        response = get_admin_dashboard()
        data = response.get_json()

    assert data["users"]["total"] == 0
    assert data["tasks"]["total"] == 0
    assert data["recentProjects"] == []


@patch("backend.src.api.controllers.dashboard_controller.get_recent_updated_project_tasks", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.get_project_tasks_due_soon", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.get_project_tasks", return_value=[])
@patch("backend.src.api.controllers.dashboard_controller.Project")
def test_get_project_dashboard_zero_completion(mock_project, mock_get_tasks, mock_due, mock_recent, app):
    project = SimpleNamespace(
        id=8,
        name="Empty Project",
        description="No tasks yet",
        status="active",
        team_members=SimpleNamespace(all=lambda: []),
    )
    mock_project.query.get.return_value = project

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_project_dashboard

        response = get_project_dashboard(8)
        data = response.get_json()

    assert data["project"]["completion_percentage"] == 0
    assert data["task_stats"]["total"] == 0


@patch("backend.src.api.controllers.dashboard_controller.get_project_scope_ids", return_value=set())
@patch("backend.src.api.controllers.dashboard_controller.joinedload", side_effect=lambda rel: rel)
@patch("backend.src.api.controllers.dashboard_controller.Project")
@patch("backend.src.api.controllers.dashboard_controller.Task")
@patch("backend.src.api.controllers.dashboard_controller.User")
@patch("backend.src.api.controllers.dashboard_controller.db")
@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "team_lead"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 2})
def test_get_admin_dashboard_team_lead_kpis(
    mock_identity,
    mock_jwt,
    mock_db,
    mock_user,
    mock_task,
    mock_project,
    mock_joinedload,
    mock_scope,
    app,
):
    now = datetime.now()
    # A real column returns a SQL expression from `<`; MagicMock returns NotImplemented.
    mock_task.deadline.__lt__.return_value = MagicMock()
    mock_user.query.get.return_value = SimpleNamespace(id=2)
    _route_db_query(
        mock_db,
        mock_task,
        mock_user,
        task_status_rows=[("todo", 4)],
        user_role_rows=[("team_lead", 1)],
        project_task_rows=[(10, 2)],
        # One membership join returns the scoped TL project ids directly.
        team_lead_project_rows=[(10,), (11,)],
        mock_project=mock_project,
    )

    scoped_project_created = SimpleNamespace(
        id=10, status="active", created_by=2, name="Created Project", created_at=now
    )
    mock_project.query.count.return_value = 3
    mock_project.query.order_by.return_value.limit.return_value.all.return_value = [scoped_project_created]

    # Admin overdue count uses .filter().filter().count(); TL KPIs use the first-level .count().
    mock_task.query.filter.return_value.filter.return_value.count.return_value = 0
    assigned_q = mock_task.query.options.return_value
    assigned_q.filter_by.return_value.order_by.return_value.limit.return_value.all.return_value = []
    # Evaluated in order: in_review, due_soon, overdue_not_complete.
    mock_task.query.filter.return_value.count.side_effect = [2, 1, 3]

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_admin_dashboard

        data = get_admin_dashboard().get_json()

    kpis = data["team_lead_kpis"]
    assert kpis["in_review_tasks"] == 2
    assert kpis["due_soon_tasks"] == 1
    assert kpis["overdue_not_complete_tasks"] == 3
    assert kpis["current_projects"] == 2


@patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "admin"})
@patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 1})
@patch("backend.src.api.controllers.dashboard_controller.User")
def test_get_admin_dashboard_user_not_found(mock_user, mock_identity, mock_jwt, app):
    mock_user.query.get.return_value = None

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_admin_dashboard

        response, status = get_admin_dashboard()

    assert status == 404
    assert response.get_json()["message"] == "User not found"
