import os
import sys
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask_jwt_extended import create_access_token, create_refresh_token

# Add backend directory to import src.* modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

import src.api.controllers.dashboard_controller as dashboard_controller
import src.auth.auth as auth_module
import src.db.models.models as models_module
import src.socketio_server as socket_module
from src.app import create_app


@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv('FLASK_ENV', 'testing')

    app = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'JWT_SECRET_KEY': 'test-secret-key-for-integration-suite-32',
        'JWT_COOKIE_SECURE': False,
        'JWT_COOKIE_SAMESITE': 'Lax',
    })

    return app


@pytest.fixture
def app(app_and_socket):
    app, _ = app_and_socket
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def auth_headers(app, role='client', user_id=1):
    with app.app_context():
        token = create_access_token(
            identity={'user_id': user_id},
            additional_claims={'role': role},
        )
    return {'Authorization': f'Bearer {token}'}


def refresh_headers(app, role='client', user_id=1):
    with app.app_context():
        token = create_refresh_token(
            identity={'user_id': user_id},
            additional_claims={'role': role},
        )
    return {'Authorization': f'Bearer {token}'}


def test_auth_register_success_contract(client, monkeypatch):
    class StubUser:
        query = MagicMock()

        def __init__(self, name, email, password, role):
            self.id = 101
            self.name = name
            self.email = email
            self.password = password
            self.role = role

    StubUser.query.filter_by.return_value.first.return_value = None

    session = MagicMock()
    hash_password = MagicMock(return_value='hashed-password')
    generate_tokens = MagicMock(return_value={
        'access_token': 'access-token',
        'refresh_token': 'refresh-token',
    })

    monkeypatch.setattr(auth_module, 'User', StubUser)
    monkeypatch.setattr(auth_module, 'hash_password', hash_password)
    monkeypatch.setattr(auth_module, 'generate_tokens', generate_tokens)
    monkeypatch.setattr(auth_module.db, 'session', session, raising=False)

    response = client.post(
        '/api/v1/auth/register',
        json={
            'name': 'Integration User',
            'email': 'integration@example.com',
            'password': 'password123',
            'role': 'client',
        },
    )

    assert response.status_code == 201
    payload = response.get_json()
    assert payload['message'] == 'User registered successfully'
    assert payload['user']['id'] == 101
    assert payload['user']['email'] == 'integration@example.com'

    hash_password.assert_called_once_with('password123')
    generate_tokens.assert_called_once_with(101, {'role': 'client'})
    session.add.assert_called_once()
    session.commit.assert_called_once_with()


def test_auth_login_success_returns_token_and_github_flags(client, monkeypatch):
    user = SimpleNamespace(
        id=7,
        name='Login User',
        email='login@example.com',
        password='stored-hash',
        role='client',
        github_username='octocat',
    )

    class StubUser:
        query = MagicMock()

    class StubGitHubToken:
        query = MagicMock()

    StubUser.query.filter_by.return_value.first.return_value = user
    StubGitHubToken.query.filter_by.return_value.first.return_value = None

    verify_password = MagicMock(return_value=True)
    generate_tokens = MagicMock(return_value={
        'access_token': 'login-access-token',
        'refresh_token': 'login-refresh-token',
    })

    monkeypatch.setattr(auth_module, 'User', StubUser)
    monkeypatch.setattr(auth_module, 'verify_password', verify_password)
    monkeypatch.setattr(auth_module, 'generate_tokens', generate_tokens)
    monkeypatch.setattr(models_module, 'GitHubToken', StubGitHubToken)

    response = client.post(
        '/api/v1/auth/login',
        json={'email': 'login@example.com', 'password': 'password123'},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['message'] == 'Login successful'
    assert payload['user']['id'] == 7
    assert payload['user']['token'] == 'login-access-token'
    assert payload['user']['github_connected'] is False

    verify_password.assert_called_once_with('password123', 'stored-hash')
    generate_tokens.assert_called_once_with(7, {'role': 'client'})


def test_auth_token_route_rejects_unknown_user(client, monkeypatch):
    class StubUser:
        query = MagicMock()

    StubUser.query.filter_by.return_value.first.return_value = None
    monkeypatch.setattr(auth_module, 'User', StubUser)

    response = client.post(
        '/api/v1/auth/token',
        json={'email': 'missing@example.com', 'password': 'password123'},
    )

    assert response.status_code == 401
    assert response.get_json()['message'] == 'Invalid email or password'


def test_auth_refresh_and_logout_routes_with_jwt(client, app):
    refresh_response = client.post('/api/v1/auth/refresh', headers=refresh_headers(app, user_id=42))
    assert refresh_response.status_code == 200
    assert 'token' in refresh_response.get_json()

    logout_response = client.post('/api/v1/auth/logout', headers=auth_headers(app, user_id=42))
    assert logout_response.status_code == 200
    assert logout_response.get_json()['message'] == 'Logout successful'


def test_socket_room_flow_and_broadcast_events(app_and_socket, app):
    _, socketio = app_and_socket

    socket_module.connected_users.clear()
    socket_module.project_rooms.clear()

    client_one = socketio.test_client(app, headers=auth_headers(app, user_id=1))
    client_two = socketio.test_client(app, headers=auth_headers(app, user_id=2))

    assert client_one.is_connected()
    assert client_two.is_connected()

    register_one = client_one.emit('register', {}, callback=True)
    register_two = client_two.emit('register', {}, callback=True)
    assert register_one['status'] == 'success'
    assert register_two['status'] == 'success'

    join_one = client_one.emit('join_project', {'project_id': 88}, callback=True)
    join_two = client_two.emit('join_project', {'project_id': 88}, callback=True)
    assert join_one['status'] == 'success'
    assert join_two['status'] == 'success'
    assert set(socket_module.project_rooms[88]) == {1, 2}

    task_update_ack = client_one.emit(
        'task_update',
        {'project_id': 88, 'task_id': 9, 'update_type': 'completed', 'timestamp': '2026-04-20T10:00:00Z'},
        callback=True,
    )
    assert task_update_ack['status'] == 'success'

    comment_ack = client_one.emit(
        'comment_added',
        {
            'project_id': 88,
            'task_id': 9,
            'comment_id': 33,
            'mentioned_users': [2],
            'timestamp': '2026-04-20T10:01:00Z',
        },
        callback=True,
    )
    assert comment_ack['status'] == 'success'

    project_update_ack = client_one.emit(
        'project_updated',
        {'project_id': 88, 'update_type': 'member_added', 'timestamp': '2026-04-20T10:02:00Z'},
        callback=True,
    )
    assert project_update_ack['status'] == 'success'

    leave_two = client_two.emit('leave_project', {'project_id': 88}, callback=True)
    assert leave_two['status'] == 'success'
    assert 2 not in socket_module.project_rooms[88]

    client_one.disconnect()
    client_two.disconnect()

    assert 1 not in socket_module.connected_users
    assert 2 not in socket_module.connected_users


def test_socket_handlers_validate_required_payload_fields(app_and_socket, app):
    _, socketio = app_and_socket

    socket_module.connected_users.clear()
    socket_module.project_rooms.clear()

    ws_client = socketio.test_client(app, headers=auth_headers(app, user_id=3))
    assert ws_client.is_connected()

    ws_client.emit('register', {}, callback=True)

    join_error = ws_client.emit('join_project', {}, callback=True)
    assert join_error['status'] == 'error'
    assert join_error['message'] == 'Project ID required'

    comment_error = ws_client.emit('comment_added', {'project_id': 1, 'task_id': 1}, callback=True)
    assert comment_error['status'] == 'error'
    assert comment_error['message'] == 'Missing required data'

    project_error = ws_client.emit('project_updated', {}, callback=True)
    assert project_error['status'] == 'error'
    assert project_error['message'] == 'Project ID required'

    ws_client.disconnect()


def test_dashboard_client_route_returns_computed_task_stats(client, app, monkeypatch):
    user = SimpleNamespace(
        id=21,
        name='Client User',
        role='client',
        projects=SimpleNamespace(all=lambda: [SimpleNamespace(id=5, name='Project A', status='active')]),
    )

    due_task = SimpleNamespace(
        id=9,
        title='Due Task',
        deadline=datetime(2099, 1, 1),
        status='in_progress',
        project_id=5,
    )

    assigned_tasks = [
        SimpleNamespace(status='todo'),
        SimpleNamespace(status='done'),
    ]

    class StubUser:
        query = MagicMock()

    StubUser.query.get.return_value = user

    monkeypatch.setattr(dashboard_controller, 'User', StubUser)
    monkeypatch.setattr(dashboard_controller, 'get_user_tasks', MagicMock(return_value=assigned_tasks))
    monkeypatch.setattr(dashboard_controller, 'get_tasks_due_soon', MagicMock(return_value=[due_task]))

    response = client.get('/api/v1/dashboard/client', headers=auth_headers(app, role='client', user_id=21))

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['tasks']['total'] == 2
    assert payload['tasks']['todo'] == 1
    assert payload['tasks']['done'] == 1
    assert payload['tasks_due_soon'][0]['id'] == 9
    assert payload['projects'][0]['name'] == 'Project A'


def test_dashboard_admin_route_returns_user_and_task_totals(client, app, monkeypatch):
    admin_user = SimpleNamespace(id=1, name='Admin User', role='admin')
    users = [
        SimpleNamespace(role='admin'),
        SimpleNamespace(role='client'),
        SimpleNamespace(role='client'),
    ]
    tasks = [
        SimpleNamespace(status='todo'),
        SimpleNamespace(status='in_progress'),
        SimpleNamespace(status='review'),
        SimpleNamespace(status='done'),
    ]

    class StubUser:
        query = MagicMock()

    class StubTask:
        query = MagicMock()

    class StubProject:
        query = MagicMock()

    StubUser.query.get.return_value = admin_user
    StubUser.query.all.return_value = users
    StubTask.query.all.return_value = tasks
    StubProject.query.count.return_value = 4

    monkeypatch.setattr(dashboard_controller, 'User', StubUser)
    monkeypatch.setattr(dashboard_controller, 'Task', StubTask)
    monkeypatch.setattr(dashboard_controller, 'Project', StubProject)

    response = client.get('/api/v1/dashboard/admin', headers=auth_headers(app, role='admin', user_id=1))

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['users']['total'] == 3
    assert payload['users']['admin'] == 1
    assert payload['users']['client'] == 2
    assert payload['tasks']['total'] == 4
    assert payload['projects']['total'] == 4


def test_dashboard_project_route_returns_project_metrics(client, app, monkeypatch):
    project = SimpleNamespace(
        id=11,
        name='Project Delta',
        description='Important project',
        status='active',
        team_members=SimpleNamespace(all=lambda: [SimpleNamespace(id=1, name='Client One', role='client')]),
    )

    project_tasks = [
        SimpleNamespace(id=1, title='Task One', status='done', assigned_to=1, deadline=datetime(2099, 2, 1), updated_at=datetime(2099, 1, 1)),
        SimpleNamespace(id=2, title='Task Two', status='todo', assigned_to=1, deadline=datetime(2099, 2, 2), updated_at=datetime(2099, 1, 2)),
    ]

    class StubProject:
        query = MagicMock()

    StubProject.query.get.return_value = project

    monkeypatch.setattr(dashboard_controller, 'Project', StubProject)
    monkeypatch.setattr(dashboard_controller, 'get_project_tasks', MagicMock(return_value=project_tasks))
    monkeypatch.setattr(dashboard_controller, 'get_project_tasks_due_soon', MagicMock(return_value=project_tasks[:1]))
    monkeypatch.setattr(dashboard_controller, 'get_recent_updated_project_tasks', MagicMock(return_value=project_tasks[:1]))

    response = client.get('/api/v1/dashboard/projects/11', headers=auth_headers(app, role='client', user_id=1))

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['project']['name'] == 'Project Delta'
    assert payload['task_stats']['total'] == 2
    assert payload['task_stats']['done'] == 1
    assert payload['project']['completion_percentage'] == 50.0
    assert payload['team_members'][0]['name'] == 'Client One'


def test_dashboard_project_route_returns_404_for_missing_project(client, app, monkeypatch):
    class StubProject:
        query = MagicMock()

    StubProject.query.get.return_value = None
    monkeypatch.setattr(dashboard_controller, 'Project', StubProject)

    response = client.get('/api/v1/dashboard/projects/999', headers=auth_headers(app, role='client', user_id=1))

    assert response.status_code == 404
    assert response.get_json()['message'] == 'Project not found'
