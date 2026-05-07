"""Tests for task routes — Team Lead can update any task field."""
import os
import sys

import pytest
from unittest.mock import MagicMock
from flask_jwt_extended import create_access_token

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.app import create_app
from src.api.routes import tasks_routes


@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv('FLASK_ENV', 'testing')
    app, socketio = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'JWT_SECRET_KEY': 'test-secret-key-tasks-routes-32ch',
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


def test_team_lead_can_update_task(client, app, monkeypatch):
    """Team Lead should reach the update handler."""
    handler = MagicMock(return_value=({'message': 'Task updated'}, 200))
    monkeypatch.setattr(tasks_routes, 'update_task_by_id', handler)

    resp = client.put(
        '/api/v1/tasks/1',
        headers=auth_headers(app, 'team_lead'),
        json={'title': 'Updated Title', 'priority': 'high'}
    )
    assert resp.status_code == 200
    handler.assert_called_once_with(1)


def test_admin_can_update_task(client, app, monkeypatch):
    """Admin should reach the update handler."""
    handler = MagicMock(return_value=({'message': 'Task updated'}, 200))
    monkeypatch.setattr(tasks_routes, 'update_task_by_id', handler)

    resp = client.put(
        '/api/v1/tasks/1',
        headers=auth_headers(app, 'admin'),
        json={'title': 'Updated by Admin'}
    )
    assert resp.status_code == 200
    handler.assert_called_once_with(1)


def test_developer_can_update_own_assigned_task(client, app, monkeypatch):
    """Developer should reach the update handler (controller enforces ownership)."""
    handler = MagicMock(return_value=({'message': 'Task updated'}, 200))
    monkeypatch.setattr(tasks_routes, 'update_task_by_id', handler)

    resp = client.put(
        '/api/v1/tasks/1',
        headers=auth_headers(app, 'developer'),
        json={'status': 'in_progress'}
    )
    assert resp.status_code == 200
    handler.assert_called_once_with(1)


def test_unauthenticated_cannot_update_task(client):
    """Unauthenticated requests must be rejected."""
    resp = client.put('/api/v1/tasks/1', json={'title': 'hack'})
    assert resp.status_code == 401
