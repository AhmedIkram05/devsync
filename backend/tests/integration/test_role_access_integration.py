import os
import sys
from unittest.mock import MagicMock

import pytest
from flask_jwt_extended import create_access_token

# Add backend directory to import src.* modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.app import create_app
from src.api.routes import admin_routes, dashboard_routes, tasks_routes, users_routes


@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv('FLASK_ENV', 'testing')

    app, socketio = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'JWT_SECRET_KEY': 'test-secret-key',
        'JWT_COOKIE_SECURE': False,
        'JWT_COOKIE_SAMESITE': 'Lax',
    })

    return app, socketio


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
