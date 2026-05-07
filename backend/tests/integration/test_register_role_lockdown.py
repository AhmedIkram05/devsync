"""Tests for registration role lockdown — backend ignores client-supplied role."""
import os
import sys

import pytest
from unittest.mock import patch, MagicMock

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.app import create_app


@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv('FLASK_ENV', 'testing')
    app, socketio = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'JWT_SECRET_KEY': 'test-secret-key-register-lockdown',
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


def test_register_ignores_admin_role(client, monkeypatch):
    """Supplying role='admin' in body should NOT create an admin user."""
    mock_user = MagicMock()
    mock_user.id = 99
    mock_user.name = 'Hacker'
    mock_user.email = 'hacker@test.com'
    mock_user.role = 'developer'  # The forced value

    mock_query = MagicMock()
    mock_query.filter_by.return_value.first.return_value = None
    mock_query.count.return_value = 1

    with patch('src.auth.auth.User') as MockUser, \
         patch('src.auth.auth.db') as MockDB, \
         patch('src.auth.auth.hash_password', return_value='hashed'), \
         patch('src.auth.auth.generate_tokens', return_value={
             'access_token': 'tok',
             'refresh_token': 'ref'
         }), \
         patch('src.services.settings_service.get_default_role', return_value='developer'), \
         patch('src.services.audit_service.record'):

        MockUser.query = mock_query
        MockUser.return_value = mock_user

        resp = client.post('/api/v1/auth/register', json={
            'name': 'Hacker',
            'email': 'hacker@test.com',
            'password': 'long_pass_123',
            'role': 'admin'  # This should be IGNORED
        })

        assert resp.status_code == 201
        data = resp.get_json()
        assert data['user']['role'] == 'developer'

        # Verify the User was constructed with developer role, NOT admin
        call_kwargs = MockUser.call_args
        if call_kwargs.kwargs:
            assert call_kwargs.kwargs.get('role') == 'developer'


def test_register_ignores_team_lead_role(client, monkeypatch):
    """Supplying role='team_lead' in body should also be forced to developer."""
    mock_user = MagicMock()
    mock_user.id = 100
    mock_user.name = 'Lead'
    mock_user.email = 'lead@test.com'
    mock_user.role = 'developer'

    mock_query = MagicMock()
    mock_query.filter_by.return_value.first.return_value = None
    mock_query.count.return_value = 1

    with patch('src.auth.auth.User') as MockUser, \
         patch('src.auth.auth.db') as MockDB, \
         patch('src.auth.auth.hash_password', return_value='hashed'), \
         patch('src.auth.auth.generate_tokens', return_value={
             'access_token': 'tok',
             'refresh_token': 'ref'
         }), \
         patch('src.services.settings_service.get_default_role', return_value='developer'), \
         patch('src.services.audit_service.record'):

        MockUser.query = mock_query
        MockUser.return_value = mock_user

        resp = client.post('/api/v1/auth/register', json={
            'name': 'Lead',
            'email': 'lead@test.com',
            'password': 'long_pass_123',
            'role': 'team_lead'
        })

        assert resp.status_code == 201
        data = resp.get_json()
        assert data['user']['role'] == 'developer'

def test_first_user_is_admin(client, monkeypatch):
    """The very first registered user must automatically be granted the admin role."""
    mock_user = MagicMock()
    mock_user.id = 1
    mock_user.name = 'First Admin'
    mock_user.email = 'admin@test.com'
    mock_user.role = 'admin'

    mock_query = MagicMock()
    mock_query.filter_by.return_value.first.return_value = None
    mock_query.count.return_value = 0  # <--- This triggers the admin grant

    with patch('src.auth.auth.User') as MockUser, \
         patch('src.auth.auth.db') as MockDB, \
         patch('src.auth.auth.hash_password', return_value='hashed'), \
         patch('src.auth.auth.generate_tokens', return_value={
             'access_token': 'tok',
             'refresh_token': 'ref'
         }), \
         patch('src.services.settings_service.get_default_role', return_value='developer'), \
         patch('src.services.audit_service.record'):

        MockUser.query = mock_query
        MockUser.return_value = mock_user

        resp = client.post('/api/v1/auth/register', json={
            'name': 'First Admin',
            'email': 'admin@test.com',
            'password': 'long_pass_123'
        })

        assert resp.status_code == 201
        data = resp.get_json()
        assert data['user']['role'] == 'admin'

        call_kwargs = MockUser.call_args
        if call_kwargs.kwargs:
            assert call_kwargs.kwargs.get('role') == 'admin'
