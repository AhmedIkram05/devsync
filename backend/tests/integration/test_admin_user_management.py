import os
import sys
import pytest
from flask_jwt_extended import create_access_token
from unittest.mock import MagicMock

# Add backend directory to import src.* modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.app import create_app
from src.api.routes import admin_routes
from src.api.controllers import users_controller

@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv('FLASK_ENV', 'testing')
    app, socketio = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'JWT_SECRET_KEY': 'test-secret-key-for-integration-suite-32',
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

@pytest.fixture
def auth_headers(app):
    def _auth_headers(role, user_id=1):
        with app.app_context():
            token = create_access_token(
                identity={'user_id': user_id},
                additional_claims={'role': role}
            )
        return {'Authorization': f'Bearer {token}'}
    return _auth_headers

def test_admin_create_user_rbac(client, app, auth_headers, monkeypatch):
    """Test that only admins can create users via the admin endpoint"""
    handler = MagicMock(return_value=({'message': 'User created', 'user': {'id': 2}}, 201))
    monkeypatch.setattr(admin_routes, 'create_user', handler)

    user_data = {
        'name': 'New User',
        'email': 'new@example.com',
        'password': 'password123',
        'role': 'developer'
    }

    # 1. Developer should be forbidden
    resp = client.post('/api/v1/admin/users', json=user_data, headers=auth_headers('developer'))
    assert resp.status_code == 403
    
    # 2. Team Lead should be forbidden
    resp = client.post('/api/v1/admin/users', json=user_data, headers=auth_headers('team_lead'))
    assert resp.status_code == 403

    # 3. Admin should be allowed
    resp = client.post('/api/v1/admin/users', json=user_data, headers=auth_headers('admin'))
    assert resp.status_code == 201
    assert resp.get_json()['message'] == 'User created'
    assert handler.call_count == 1

def test_admin_get_users_rbac(client, app, auth_headers, monkeypatch):
    """Test that both admins and team leads can view the user list"""
    handler = MagicMock(return_value=({'users': []}, 200))
    monkeypatch.setattr(admin_routes, 'get_all_users', handler)

    # 1. Developer should be forbidden
    resp = client.get('/api/v1/admin/users', headers=auth_headers('developer'))
    assert resp.status_code == 403

    # 2. Team Lead should be allowed
    resp = client.get('/api/v1/admin/users', headers=auth_headers('team_lead'))
    assert resp.status_code == 200

    # 3. Admin should be allowed
    resp = client.get('/api/v1/admin/users', headers=auth_headers('admin'))
    assert resp.status_code == 200
    assert handler.call_count == 2

def test_admin_delete_user_rbac(client, app, auth_headers, monkeypatch):
    """Test that only admins can delete users"""
    handler = MagicMock(return_value=({'message': 'User deleted'}, 200))
    monkeypatch.setattr(admin_routes, 'delete_user', handler)

    # 1. Team Lead should be forbidden
    resp = client.delete('/api/v1/admin/users/2', headers=auth_headers('team_lead'))
    assert resp.status_code == 403

    # 2. Admin should be allowed
    resp = client.delete('/api/v1/admin/users/2', headers=auth_headers('admin'))
    assert resp.status_code == 200
    assert handler.call_count == 1
