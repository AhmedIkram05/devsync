import os
import sys
from unittest.mock import MagicMock

import pytest
from flask_jwt_extended import create_access_token

# Add backend directory to import src.* modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.app import create_app
from src.api.routes import (
    admin_routes,
    comments_routes,
    dashboard_routes,
    github_routes,
    projects_routes,
    tasks_routes,
    users_routes,
)


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


def auth_headers(app, role, user_id=1):
    with app.app_context():
        token = create_access_token(
            identity={'user_id': user_id},
            additional_claims={'role': role}
        )
    return {'Authorization': f'Bearer {token}'}


def test_users_route_requires_admin_role(client, app, monkeypatch):
    handler = MagicMock(return_value=({'users': []}, 200))
    monkeypatch.setattr(users_routes, 'get_all_users', handler)

    unauthorized_response = client.get('/api/v1/users')
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.get('/api/v1/users', headers=auth_headers(app, 'client'))
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()['message'] == 'Insufficient permissions'
    assert handler.call_count == 0

    allowed_response = client.get('/api/v1/users', headers=auth_headers(app, 'admin'))
    assert allowed_response.status_code == 200
    assert allowed_response.get_json() == {'users': []}
    handler.assert_called_once_with()


def test_admin_stats_route_requires_admin_role(client, app, monkeypatch):
    handler = MagicMock(return_value=({'users': {'total': 5}}, 200))
    monkeypatch.setattr(admin_routes, 'get_system_stats', handler)

    unauthorized_response = client.get('/api/v1/admin/stats')
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.get('/api/v1/admin/stats', headers=auth_headers(app, 'client'))
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()['message'] == 'Admin access required'
    assert handler.call_count == 0

    allowed_response = client.get('/api/v1/admin/stats', headers=auth_headers(app, 'admin'))
    assert allowed_response.status_code == 200
    assert allowed_response.get_json()['users']['total'] == 5
    handler.assert_called_once_with()


def test_client_dashboard_route_requires_client_role(client, app, monkeypatch):
    handler = MagicMock(return_value=({'projects': []}, 200))
    monkeypatch.setattr(dashboard_routes, 'get_client_dashboard', handler)

    unauthorized_response = client.get('/api/v1/dashboard/client')
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.get('/api/v1/dashboard/client', headers=auth_headers(app, 'admin'))
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()['message'] == 'Insufficient permissions'
    assert handler.call_count == 0

    allowed_response = client.get('/api/v1/dashboard/client', headers=auth_headers(app, 'client'))
    assert allowed_response.status_code == 200
    assert allowed_response.get_json() == {'projects': []}
    handler.assert_called_once_with()


def test_task_delete_route_requires_admin_role(client, app, monkeypatch):
    handler = MagicMock(return_value=('', 204))
    monkeypatch.setattr(tasks_routes, 'delete_task_by_id', handler)

    unauthorized_response = client.delete('/api/v1/tasks/1')
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.delete('/api/v1/tasks/1', headers=auth_headers(app, 'client'))
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()['message'] == 'Insufficient permissions'
    assert handler.call_count == 0

    allowed_response = client.delete('/api/v1/tasks/1', headers=auth_headers(app, 'admin'))
    assert allowed_response.status_code == 204
    handler.assert_called_once_with(1)


def test_project_create_route_requires_admin_role(client, app, monkeypatch):
    handler = MagicMock(return_value=({'message': 'Project created'}, 201))
    monkeypatch.setattr(projects_routes, 'create_project', handler)

    unauthorized_response = client.post('/api/v1/projects', json={'name': 'New', 'description': 'Desc'})
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.post(
        '/api/v1/projects',
        headers=auth_headers(app, 'client'),
        json={'name': 'New', 'description': 'Desc'},
    )
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()['message'] == 'Insufficient permissions'
    assert handler.call_count == 0

    allowed_response = client.post(
        '/api/v1/projects',
        headers=auth_headers(app, 'admin'),
        json={'name': 'New', 'description': 'Desc'},
    )
    assert allowed_response.status_code == 201
    assert allowed_response.get_json()['message'] == 'Project created'
    handler.assert_called_once_with()


def test_project_update_route_requires_admin_role(client, app, monkeypatch):
    handler = MagicMock(return_value=({'message': 'Project updated'}, 200))
    monkeypatch.setattr(projects_routes, 'update_project', handler)

    unauthorized_response = client.put('/api/v1/projects/5', json={'name': 'Update'})
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.put(
        '/api/v1/projects/5',
        headers=auth_headers(app, 'client'),
        json={'name': 'Update'},
    )
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()['message'] == 'Insufficient permissions'
    assert handler.call_count == 0

    allowed_response = client.put(
        '/api/v1/projects/5',
        headers=auth_headers(app, 'admin'),
        json={'name': 'Update'},
    )
    assert allowed_response.status_code == 200
    assert allowed_response.get_json()['message'] == 'Project updated'
    handler.assert_called_once_with(5)


def test_project_delete_route_requires_admin_role(client, app, monkeypatch):
    handler = MagicMock(return_value=('', 204))
    monkeypatch.setattr(projects_routes, 'delete_project', handler)

    unauthorized_response = client.delete('/api/v1/projects/5')
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.delete('/api/v1/projects/5', headers=auth_headers(app, 'client'))
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()['message'] == 'Insufficient permissions'
    assert handler.call_count == 0

    allowed_response = client.delete('/api/v1/projects/5', headers=auth_headers(app, 'admin'))
    assert allowed_response.status_code == 204
    handler.assert_called_once_with(5)


def test_admin_dashboard_route_requires_admin_role(client, app, monkeypatch):
    handler = MagicMock(return_value=({'stats': {'total_users': 3}}, 200))
    monkeypatch.setattr(dashboard_routes, 'get_admin_dashboard', handler)

    unauthorized_response = client.get('/api/v1/dashboard/admin')
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    forbidden_response = client.get('/api/v1/dashboard/admin', headers=auth_headers(app, 'client'))
    assert forbidden_response.status_code == 403
    assert forbidden_response.get_json()['message'] == 'Insufficient permissions'
    assert handler.call_count == 0

    allowed_response = client.get('/api/v1/dashboard/admin', headers=auth_headers(app, 'admin'))
    assert allowed_response.status_code == 200
    assert allowed_response.get_json()['stats']['total_users'] == 3
    handler.assert_called_once_with()


def test_project_tasks_route_requires_auth_and_passes_project_id(client, app, monkeypatch):
    handler = MagicMock(return_value=({'tasks': []}, 200))
    monkeypatch.setattr(projects_routes, 'get_project_tasks', handler)

    unauthorized_response = client.get('/api/v1/projects/42/tasks')
    assert unauthorized_response.status_code == 401
    assert handler.call_count == 0

    allowed_response = client.get('/api/v1/projects/42/tasks', headers=auth_headers(app, 'client'))
    assert allowed_response.status_code == 200
    assert allowed_response.get_json() == {'tasks': []}
    handler.assert_called_once_with(42)


def test_comments_routes_enforce_auth_and_json_contract(client, app, monkeypatch):
    get_comments_handler = MagicMock(return_value=({'comments': []}, 200))
    create_comment_handler = MagicMock(return_value=({'id': 1, 'content': 'hello'}, 201))
    monkeypatch.setattr(comments_routes, 'get_task_comments', get_comments_handler)
    monkeypatch.setattr(comments_routes, 'add_comment', create_comment_handler)

    unauthorized_get_response = client.get('/api/v1/tasks/7/comments')
    assert unauthorized_get_response.status_code == 401
    assert get_comments_handler.call_count == 0

    allowed_get_response = client.get('/api/v1/tasks/7/comments', headers=auth_headers(app, 'client'))
    assert allowed_get_response.status_code == 200
    assert allowed_get_response.get_json() == {'comments': []}
    get_comments_handler.assert_called_once_with(7)

    missing_json_response = client.post('/api/v1/tasks/7/comments', headers=auth_headers(app, 'client'))
    assert missing_json_response.status_code == 400
    assert missing_json_response.get_json()['message'] == 'Missing JSON in request body'
    assert create_comment_handler.call_count == 0

    allowed_create_response = client.post(
        '/api/v1/tasks/7/comments',
        headers=auth_headers(app, 'client'),
        json={'content': 'hello'},
    )
    assert allowed_create_response.status_code == 201
    assert allowed_create_response.get_json()['content'] == 'hello'
    create_comment_handler.assert_called_once_with(7)


def test_github_exchange_rejects_missing_or_invalid_state(client, monkeypatch):
    missing_code_response = client.get('/api/v1/github/exchange')
    assert missing_code_response.status_code == 400
    assert missing_code_response.get_json()['message'] == 'No code provided'

    github_routes.oauth_states.clear()
    parse_state = MagicMock(return_value=None)
    monkeypatch.setattr(github_routes.GitHubClient, 'parse_state_param', parse_state)

    invalid_state_response = client.get('/api/v1/github/exchange?code=test-code&state=invalid-state')
    assert invalid_state_response.status_code == 400
    assert invalid_state_response.get_json()['message'] == 'Invalid state parameter'
    parse_state.assert_called_once_with('invalid-state')


def test_github_callback_post_rejects_invalid_request_and_failed_exchange(client, monkeypatch):
    missing_params_response = client.post('/api/v1/github/callback', json={'state': 'only-state'})
    assert missing_params_response.status_code == 400
    assert missing_params_response.get_json()['error'] == 'Missing required parameters'

    github_routes.oauth_states.clear()
    parse_state = MagicMock(return_value='1')
    exchange_code = MagicMock(return_value=None)
    monkeypatch.setattr(github_routes.GitHubClient, 'parse_state_param', parse_state)
    monkeypatch.setattr(github_routes.GitHubClient, 'exchange_code_for_token', exchange_code)

    failed_exchange_response = client.post(
        '/api/v1/github/callback',
        json={'code': 'test-code', 'state': 'state-without-token'},
    )
    assert failed_exchange_response.status_code == 400
    assert failed_exchange_response.get_json()['error'] == 'Failed to obtain access token'
    parse_state.assert_called_once_with('state-without-token')
    exchange_code.assert_called_once_with('test-code')
