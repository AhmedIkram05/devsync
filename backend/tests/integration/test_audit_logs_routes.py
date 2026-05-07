"""Tests for audit log route access control, filters, and pagination."""
import os
import sys

import pytest
from unittest.mock import MagicMock
from flask_jwt_extended import create_access_token

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.app import create_app
from src.api.routes import audit_routes


@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv('FLASK_ENV', 'testing')
    app, socketio = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'JWT_SECRET_KEY': 'test-secret-key-audit-logs-32chars',
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


def test_audit_logs_requires_auth(client):
    """Unauthenticated requests must be rejected."""
    resp = client.get('/api/v1/admin/audit-logs')
    assert resp.status_code == 401


def test_audit_logs_requires_admin(client, app):
    """Developer and Team Lead must be denied."""
    for role in ('developer', 'team_lead'):
        resp = client.get(
            '/api/v1/admin/audit-logs',
            headers=auth_headers(app, role)
        )
        assert resp.status_code == 403, f'{role} should be denied'


def test_audit_logs_admin_allowed(client, app, monkeypatch):
    """Admin should reach the handler."""
    handler = MagicMock(return_value=({
        'logs': [],
        'total': 0,
        'pages': 0,
        'current_page': 1
    }, 200))
    monkeypatch.setattr(audit_routes, 'get_audit_logs', handler)

    resp = client.get(
        '/api/v1/admin/audit-logs',
        headers=auth_headers(app, 'admin')
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'logs' in data
    handler.assert_called_once()


def test_audit_log_detail_requires_admin(client, app):
    """GET /admin/audit-logs/<id> must require admin."""
    resp = client.get(
        '/api/v1/admin/audit-logs/1',
        headers=auth_headers(app, 'developer')
    )
    assert resp.status_code == 403


def test_audit_log_detail_admin_allowed(client, app, monkeypatch):
    """Admin should be able to fetch a single log."""
    handler = MagicMock(return_value=({
        'log': {'id': 1, 'action': 'user_login'}
    }, 200))
    monkeypatch.setattr(audit_routes, 'get_audit_log_by_id', handler)

    resp = client.get(
        '/api/v1/admin/audit-logs/1',
        headers=auth_headers(app, 'admin')
    )
    assert resp.status_code == 200
    handler.assert_called_once_with(1)
