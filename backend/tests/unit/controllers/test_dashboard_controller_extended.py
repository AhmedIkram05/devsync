from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


def _task(**kwargs):
    defaults = {
        'id': 1,
        'title': 'Task',
        'description': 'Desc',
        'status': 'todo',
        'priority': 'medium',
        'progress': 20,
        'deadline': None,
        'project_id': 1,
        'project': None,
        'updated_at': None,
        'created_at': None,
        'assigned_to': 1,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_dashboard_helpers_basic():
    from backend.src.api.controllers import dashboard_controller as dc

    assert dc._count([1, 2, 3], lambda x: x > 1) == 2
    assert dc._is_completed_status('done') is True
    assert dc._is_completed_status('completed') is True
    assert dc._is_completed_status('todo') is False
    assert dc._is_completed_task(SimpleNamespace(status='completed')) is True


@patch('backend.src.api.controllers.dashboard_controller.User')
def test_safe_query_all_error_returns_empty(mock_user):
    from backend.src.api.controllers.dashboard_controller import _safe_query_all

    mock_user.query.all.side_effect = Exception('db fail')
    assert _safe_query_all(mock_user) == []


def test_task_to_dashboard_item_and_github_activity_item():
    from backend.src.api.controllers.dashboard_controller import _task_to_dashboard_item, _github_activity_to_item

    now = datetime.now()
    task = _task(deadline=now, created_at=now, updated_at=now, project=SimpleNamespace(name='Alpha'))
    item = _task_to_dashboard_item(task)
    assert item['project_name'] == 'Alpha'
    assert item['deadline'] == now.isoformat()

    link = SimpleNamespace(
        id=1,
        pull_request_number=12,
        issue_number=None,
        created_at=now,
        task=SimpleNamespace(title='Linked Task'),
        repository=SimpleNamespace(repo_name='org/repo', repo_url='https://github.com/org/repo'),
    )
    activity = _github_activity_to_item(link)
    assert activity['type'] == 'pull_request'
    assert activity['label'] == '#12'
    assert activity['url'].endswith('/pull/12')


@patch('backend.src.api.controllers.dashboard_controller.Task')
def test_get_user_tasks_and_project_tasks_error_paths(mock_task):
    from backend.src.api.controllers.dashboard_controller import get_user_tasks, get_project_tasks

    mock_task.query.filter_by.side_effect = Exception('db fail')
    assert get_user_tasks(1) == []
    assert get_project_tasks(10) == []


@patch('backend.src.api.controllers.dashboard_controller.Task')
def test_get_tasks_due_soon_filters_user_and_project(mock_task):
    from backend.src.api.controllers.dashboard_controller import get_tasks_due_soon

    final_query = MagicMock()
    q3 = MagicMock()
    q2 = MagicMock()
    q1 = MagicMock()
    mock_task.query.filter.return_value = q1
    q1.filter.return_value = q2
    q2.filter.return_value = q3
    q3.filter.return_value = final_query
    final_query.all.return_value = [_task()]

    assert len(get_tasks_due_soon(user_id=9)) == 1

    final_query2 = MagicMock()
    q3.filter.return_value = final_query2
    final_query2.all.return_value = [_task(project_id=7)]
    assert len(get_tasks_due_soon(project_ids={7})) == 1


@patch('backend.src.api.controllers.dashboard_controller.Task')
def test_get_tasks_due_soon_handles_exception(mock_task):
    from backend.src.api.controllers.dashboard_controller import get_tasks_due_soon

    mock_task.query.filter.side_effect = Exception('boom')
    assert get_tasks_due_soon(user_id=1) == []


@patch('backend.src.api.controllers.dashboard_controller.Task')
def test_get_recent_completed_tasks_error_path(mock_task):
    from backend.src.api.controllers.dashboard_controller import get_recent_completed_tasks

    mock_task.query.filter_by.side_effect = Exception('boom')
    assert get_recent_completed_tasks(1, 'month') == []


@patch('backend.src.api.controllers.dashboard_controller.Task')
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


@patch('backend.src.api.controllers.dashboard_controller.get_jwt', return_value={'role': 'developer'})
@patch('backend.src.api.controllers.dashboard_controller.get_jwt_identity', return_value={'user_id': 1})
@patch('backend.src.api.controllers.dashboard_controller.User')
def test_get_user_dashboard_user_not_found(mock_user, mock_identity, mock_jwt, app):
    mock_user.query.get.return_value = None

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_user_dashboard

        response, status = get_user_dashboard()

    assert status == 404
    assert response.get_json()['message'] == 'User not found'


@patch('backend.src.api.controllers.dashboard_controller.get_recent_completed_tasks', return_value=[])
@patch('backend.src.api.controllers.dashboard_controller.get_tasks_due_soon', return_value=[])
@patch('backend.src.api.controllers.dashboard_controller.get_user_tasks', return_value=[])
@patch('backend.src.api.controllers.dashboard_controller.get_jwt', return_value={'role': 'developer'})
@patch('backend.src.api.controllers.dashboard_controller.get_jwt_identity', return_value={'user_id': 1})
@patch('backend.src.api.controllers.dashboard_controller.User')
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
        name='Dev',
        role='developer',
        projects=SimpleNamespace(all=lambda: [SimpleNamespace(id=1, name='P1', status='active')]),
    )
    mock_user.query.get.return_value = user

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_user_dashboard

        response = get_user_dashboard()
        data = response.get_json()

    assert data['user']['id'] == 1
    assert data['tasks']['assigned_count'] == 0
    assert len(data['projects']) == 1


@patch('backend.src.api.controllers.dashboard_controller.Project')
@patch('backend.src.api.controllers.dashboard_controller.get_jwt', return_value={'role': 'team_lead'})
@patch('backend.src.api.controllers.dashboard_controller.get_jwt_identity', return_value={'user_id': 2})
@patch('backend.src.api.controllers.dashboard_controller.User')
@patch('backend.src.api.controllers.dashboard_controller.TaskGitHubLink')
@patch('backend.src.api.controllers.dashboard_controller.Task')
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
        projects=SimpleNamespace(all=lambda: [SimpleNamespace(id=10, name='P1', status='active')]),
    )
    mock_user.query.get.return_value = user
    mock_project.query.filter_by.return_value.all.return_value = [SimpleNamespace(id=11, name='P2', status='active')]

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

    assert 'taskCounts' in data
    assert len(data['projects']) == 2


@patch('backend.src.api.controllers.dashboard_controller.get_jwt', return_value={'role': 'developer'})
@patch('backend.src.api.controllers.dashboard_controller.get_jwt_identity', return_value={'user_id': 2})
@patch('backend.src.api.controllers.dashboard_controller.User')
def test_get_client_dashboard_user_not_found(mock_user, mock_identity, mock_jwt, app):
    mock_user.query.get.return_value = None

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_client_dashboard

        response, status = get_client_dashboard()

    assert status == 404


@patch('backend.src.api.controllers.dashboard_controller.get_jwt', return_value={'role': 'developer'})
@patch('backend.src.api.controllers.dashboard_controller.get_jwt_identity', return_value={'user_id': 2})
def test_get_admin_dashboard_unauthorized(mock_identity, mock_jwt, app):
    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_admin_dashboard

        response, status = get_admin_dashboard()

    assert status == 403


@patch('backend.src.api.controllers.dashboard_controller.settings_service.cleanup_completed_projects')
@patch('backend.src.api.controllers.dashboard_controller.get_project_scope_ids', return_value=set())
@patch('backend.src.api.controllers.dashboard_controller.count_overdue_tasks', return_value=0)
@patch('backend.src.api.controllers.dashboard_controller.Project')
@patch('backend.src.api.controllers.dashboard_controller.Task')
@patch('backend.src.api.controllers.dashboard_controller.User')
@patch('backend.src.api.controllers.dashboard_controller.get_jwt', return_value={'role': 'admin'})
@patch('backend.src.api.controllers.dashboard_controller.get_jwt_identity', return_value={'user_id': 1})
def test_get_admin_dashboard_success(
    mock_identity,
    mock_jwt,
    mock_user,
    mock_task,
    mock_project,
    mock_overdue,
    mock_scope,
    mock_cleanup,
    app,
):
    user = SimpleNamespace(id=1)
    mock_user.query.get.return_value = user
    mock_user.query.all.return_value = [SimpleNamespace(role='admin')]

    now = datetime.now()
    task = _task(status='todo', updated_at=now, created_at=now, assigned_to=1)
    mock_task.query.all.return_value = [task]

    project = SimpleNamespace(
        id=1,
        name='P1',
        status='active',
        created_at=now,
        updated_at=now,
        tasks=[task],
        team_members=SimpleNamespace(all=lambda: []),
        created_by=1,
    )
    mock_project.query.count.return_value = 1
    recent_q = MagicMock()
    limit_q = MagicMock()
    mock_project.query.order_by.return_value = recent_q
    recent_q.limit.return_value = limit_q
    limit_q.all.return_value = [project]
    mock_project.query.all.return_value = [project]

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_admin_dashboard

        response = get_admin_dashboard()
        data = response.get_json()

    assert data['tasks']['total'] == 1
    assert data['projects']['total'] == 1
    assert len(data['my_assigned_tasks']) == 1


@patch('backend.src.api.controllers.dashboard_controller.Project')
def test_get_project_dashboard_not_found(mock_project, app):
    mock_project.query.get.return_value = None

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_project_dashboard

        response, status = get_project_dashboard(99)

    assert status == 404


@patch('backend.src.api.controllers.dashboard_controller.get_recent_updated_project_tasks', return_value=[])
@patch('backend.src.api.controllers.dashboard_controller.get_project_tasks_due_soon', return_value=[])
@patch('backend.src.api.controllers.dashboard_controller.get_project_tasks')
@patch('backend.src.api.controllers.dashboard_controller.Project')
def test_get_project_dashboard_success(mock_project, mock_get_tasks, mock_due, mock_recent, app):
    project = SimpleNamespace(
        id=5,
        name='Proj',
        description='D',
        status='active',
        team_members=SimpleNamespace(all=lambda: [SimpleNamespace(id=2, name='A', role='developer')]),
    )
    mock_project.query.get.return_value = project
    mock_get_tasks.return_value = [_task(status='done'), _task(status='todo')]

    with app.app_context():
        from backend.src.api.controllers.dashboard_controller import get_project_dashboard

        response = get_project_dashboard(5)
        data = response.get_json()

    assert data['project']['completion_percentage'] == 50.0
    assert data['task_stats']['done'] == 1
    assert len(data['team_members']) == 1
