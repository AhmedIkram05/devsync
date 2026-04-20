import os
import sys
from unittest.mock import MagicMock

import pytest
from flask import Blueprint, Flask

import backend.src.api.controllers.users_controller as users_controller
from backend.src.api.routes import auth_routes

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

    monkeypatch.setattr(auth_routes, 'jwt_required', passthrough_decorator)
    monkeypatch.setattr(auth_routes, 'validate_json', passthrough_decorator)

    bp = Blueprint('api', __name__, url_prefix='/api/v1')
    auth_routes.register_routes(bp)
    app.register_blueprint(bp)

    return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_auth_routes_registered(app):
    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert '/api/v1/auth/login' in rules
    assert '/api/v1/auth/register' in rules
    assert '/api/v1/auth/refresh' in rules
    assert '/api/v1/auth/logout' in rules
    assert '/api/v1/auth/me' in rules
    assert '/api/v1/auth/token' in rules


def test_login_route_calls_auth_login(monkeypatch, client):
    validator = MagicMock(return_value=None)
    handler = MagicMock(return_value=({'message': 'Login successful'}, 200))
    monkeypatch.setattr(auth_routes, 'validate_login_data', validator)
    monkeypatch.setattr(auth_routes, 'login', handler)

    response = client.post('/api/v1/auth/login', json={'email': 'test@example.com', 'password': 'password123'})

    assert response.status_code == 200
    assert response.get_json()['message'] == 'Login successful'
    validator.assert_called_once()
    handler.assert_called_once_with()


def test_register_route_calls_register_user(monkeypatch, client):
    validator = MagicMock(return_value=None)
    handler = MagicMock(return_value=({'message': 'User registered successfully'}, 201))
    monkeypatch.setattr(auth_routes, 'validate_registration_data', validator)
    monkeypatch.setattr(auth_routes, 'register_user', handler)

    response = client.post(
        '/api/v1/auth/register',
        json={'name': 'New User', 'email': 'new@example.com', 'password': 'password123', 'role': 'developer'}
    )

    assert response.status_code == 201
    assert response.get_json()['message'] == 'User registered successfully'
    validator.assert_called_once()
    handler.assert_called_once_with()


def test_refresh_route_calls_refresh_token(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Token refreshed successfully'}, 200))
    monkeypatch.setattr(auth_routes, 'refresh_token', handler)

    response = client.post('/api/v1/auth/refresh')

    assert response.status_code == 200
    assert response.get_json()['message'] == 'Token refreshed successfully'
    handler.assert_called_once_with()


def test_logout_route_calls_logout_user(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Logout successful'}, 200))
    monkeypatch.setattr(auth_routes, 'logout_user', handler)

    response = client.post('/api/v1/auth/logout')

    assert response.status_code == 200
    assert response.get_json()['message'] == 'Logout successful'
    handler.assert_called_once_with()


def test_me_route_calls_current_user_profile(monkeypatch, client):
    handler = MagicMock(return_value=({'user': {'id': 1, 'name': 'Test User'}}, 200))
    monkeypatch.setattr(users_controller, 'get_current_user_profile', handler)

    response = client.get('/api/v1/auth/me')

    assert response.status_code == 200
    assert response.get_json()['user']['name'] == 'Test User'
    handler.assert_called_once_with()


def test_token_route_calls_get_token(monkeypatch, client):
    validator = MagicMock(return_value=None)
    handler = MagicMock(return_value=({'token': 'abc123'}, 200))
    monkeypatch.setattr(auth_routes, 'validate_login_data', validator)
    monkeypatch.setattr(auth_routes, 'get_token', handler)

    response = client.post('/api/v1/auth/token', json={'email': 'test@example.com', 'password': 'password123'})

    assert response.status_code == 200
    assert response.get_json()['token'] == 'abc123'
    validator.assert_called_once()
    handler.assert_called_once_with()