import os
import sys
from unittest.mock import MagicMock

import pytest
from flask import Blueprint, Flask

from backend.src.api.routes import users_routes

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))


def passthrough_decorator(*_args, **_kwargs):
    def _decorator(fn):
        return fn

    return _decorator


@pytest.fixture
def app(monkeypatch):
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret-key'
    app.config['JWT_SECRET_KEY'] = 'test-secret-key'

    monkeypatch.setattr(users_routes, 'jwt_required', passthrough_decorator)
    monkeypatch.setattr(users_routes, 'admin_required', passthrough_decorator, raising=False)
    monkeypatch.setattr(users_routes, 'role_required', passthrough_decorator, raising=False)
    monkeypatch.setattr(users_routes, 'role_at_least', passthrough_decorator, raising=False)
    monkeypatch.setattr(users_routes, 'validate_json', passthrough_decorator, raising=False)
    monkeypatch.setattr(users_routes, 'get_jwt_identity', lambda: 1, raising=False)
    monkeypatch.setattr(users_routes, 'get_jwt', lambda: {'role': 'admin'}, raising=False)

    bp = Blueprint('api', __name__, url_prefix='/api/v1')
    users_routes.register_routes(bp)
    app.register_blueprint(bp)

    return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_users_routes_registered(app):
    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert '/api/v1/users' in rules
    assert '/api/v1/users/<int:user_id>' in rules
    assert '/api/v1/profile' in rules


def test_get_all_users_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'users': []}, 200))
    monkeypatch.setattr(users_routes, 'get_all_users', handler)

    response = client.get('/api/v1/users')

    assert response.status_code == 200
    assert response.get_json() == {'users': []}
    handler.assert_called_once_with()


def test_get_user_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'user': {'id': 1}}, 200))
    monkeypatch.setattr(users_routes, 'get_user_by_id', handler)

    response = client.get('/api/v1/users/1')

    assert response.status_code == 200
    assert response.get_json()['user']['id'] == 1
    handler.assert_called_once_with(1)


def test_update_user_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'User updated'}, 200))
    monkeypatch.setattr(users_routes, 'update_user', handler)

    response = client.put('/api/v1/users/1', json={'name': 'Updated User'})

    assert response.status_code == 200
    assert response.get_json()['message'] == 'User updated'
    handler.assert_called_once_with(1)


def test_delete_user_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'User deleted'}, 200))
    monkeypatch.setattr(users_routes, 'delete_user', handler)

    response = client.delete('/api/v1/users/1')

    assert response.status_code == 200
    assert response.get_json()['message'] == 'User deleted'
    handler.assert_called_once_with(1)


def test_get_profile_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'user': {'id': 1}}, 200))
    monkeypatch.setattr(users_routes, 'get_current_user_profile', handler)

    response = client.get('/api/v1/profile')

    assert response.status_code == 200
    assert response.get_json()['user']['id'] == 1
    handler.assert_called_once_with()


def test_update_profile_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Profile updated'}, 200))
    monkeypatch.setattr(users_routes, 'update_current_user_profile', handler)

    response = client.put('/api/v1/profile', json={'name': 'Updated Profile'})

    assert response.status_code == 200
    assert response.get_json()['message'] == 'Profile updated'
    handler.assert_called_once_with()