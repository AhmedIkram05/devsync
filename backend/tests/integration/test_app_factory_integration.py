import os
import sys

import pytest

# Add backend directory to import src.* modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.app import create_app


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
def client(app_and_socket):
    app, _ = app_and_socket
    return app.test_client()


def test_create_app_returns_app_and_socket(app_and_socket):
    app, socketio = app_and_socket

    assert app is not None
    assert socketio is not None


def test_root_health_endpoint(client):
    response = client.get('/')

    assert response.status_code == 200
    assert response.get_data(as_text=True) == 'DevSync API is running'


def test_swagger_spec_endpoint_available(client):
    response = client.get('/api/swagger.yaml')

    assert response.status_code == 200


def test_api_v1_core_routes_registered(app_and_socket):
    app, _ = app_and_socket
    rules = {rule.rule for rule in app.url_map.iter_rules()}

    assert '/api/v1/auth/login' in rules
    assert '/api/v1/auth/register' in rules
    assert '/api/v1/tasks' in rules
    assert '/api/v1/projects' in rules
    assert '/api/v1/notifications' in rules


def test_unversioned_api_path_is_not_available(client):
    response = client.get('/api/users')

    assert response.status_code == 404


def test_public_login_route_validation_contract_without_token(client):
    response = client.post('/api/v1/auth/login')

    assert response.status_code == 400
    payload = response.get_json()
    assert payload['status'] == 'error'
    assert payload['message'] == 'Missing JSON in request body'


def test_protected_route_requires_token_with_expected_contract(client):
    response = client.get('/api/v1/users')

    assert response.status_code == 401
    payload = response.get_json()
    assert payload['status'] == 401
    assert payload['error'] == 'authorization_required'
    assert payload['message'] == 'Authentication token is missing'


def test_public_github_connect_route_does_not_require_token(client):
    response = client.get('/api/v1/github/connect')

    assert response.status_code == 400
    payload = response.get_json()
    assert payload['error'] == 'User ID is required'
