"""Tests for GET /users/:id access control — self vs other per role."""
import os
import sys

import pytest
from unittest.mock import MagicMock
from flask_jwt_extended import create_access_token

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.app import create_app
from src.api.routes import users_routes


@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv('FLASK_ENV', 'testing')
    app, socketio = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'JWT_SECRET_KEY': 'test-secret-key-users-routes-32chr',
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


def test_get_user_self_developer(client, app, monkeypatch):
    """Developer can view their own profile."""
    handler = MagicMock(return_value=({'user': {'id': 5, 'name': 'Dev'}}, 200))
    monkeypatch.setattr(users_routes, 'get_user_by_id', handler)

    resp = client.get(
        '/api/v1/users/5',
        headers=auth_headers(app, 'developer', user_id=5)
    )
    assert resp.status_code == 200
    handler.assert_called_once_with(5)


def test_get_user_other_developer_denied(client, app, monkeypatch):
    """Developer cannot view another user's profile."""
    handler = MagicMock(return_value=({'user': {'id': 6}}, 200))
    monkeypatch.setattr(users_routes, 'get_user_by_id', handler)

    resp = client.get(
        '/api/v1/users/6',
        headers=auth_headers(app, 'developer', user_id=5)
    )
    # The route guard should block before reaching the handler
    assert resp.status_code == 403


def test_get_user_team_lead_can_view_others(client, app, monkeypatch):
    """Team Lead can view any user's profile."""
    handler = MagicMock(return_value=({'user': {'id': 6}}, 200))
    monkeypatch.setattr(users_routes, 'get_user_by_id', handler)

    resp = client.get(
        '/api/v1/users/6',
        headers=auth_headers(app, 'team_lead', user_id=5)
    )
    assert resp.status_code == 200
    handler.assert_called_once_with(6)


def test_get_user_admin_can_view_others(client, app, monkeypatch):
    """Admin can view any user's profile."""
    handler = MagicMock(return_value=({'user': {'id': 6}}, 200))
    monkeypatch.setattr(users_routes, 'get_user_by_id', handler)

    resp = client.get(
        '/api/v1/users/6',
        headers=auth_headers(app, 'admin', user_id=5)
    )
    assert resp.status_code == 200
    handler.assert_called_once_with(6)


def test_get_user_unauthenticated(client):
    """Unauthenticated requests must be rejected."""
    resp = client.get('/api/v1/users/1')
    assert resp.status_code == 401
