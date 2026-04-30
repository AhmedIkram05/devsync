import os
import sys
from unittest.mock import MagicMock

import pytest
from flask_jwt_extended import create_access_token

# Add backend directory to import src.* modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.app import create_app
from src.api.routes import github_routes
from src.socketio_server import connected_users, project_rooms


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
def client(app_and_socket):
    app, _ = app_and_socket
    return app.test_client()


def test_create_app_returns_app_and_socket(app_and_socket):
    app, socketio = app_and_socket

    assert app is not None
    assert socketio is not None


def test_create_app_with_malformed_config(monkeypatch):
    monkeypatch.setenv('FLASK_ENV', 'testing')

    # Provide a malformed or missing key structure
    # Should degenerate gracefully and fall back to defaults, or safely raise specific exception
    # Since we don't know the exact raise yet, we test that create_app handles raw dict
    app, socketio = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'JWT_SECRET_KEY': None, # Malformed
        'JWT_COOKIE_SECURE': 'False', # String instead of bool
    })
    
    assert app is not None
    # the config should either convert it or keep it as is
    assert app.config['TESTING'] is True


def test_root_health_endpoint(client):
    response = client.get('/')

    assert response.status_code == 200
    assert response.get_data(as_text=True) == 'DevSync API is running'


def test_health_endpoint(client):
    response = client.get('/health')

    assert response.status_code == 200
    assert response.get_json() == {'status': 'ok'}


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


def test_socket_register_accepts_valid_bearer_token(app_and_socket):
    app, socketio = app_and_socket

    connected_users.clear()
    project_rooms.clear()

    with app.app_context():
        token = create_access_token(identity={'user_id': 88}, additional_claims={'role': 'client'})

    ws_client = socketio.test_client(app, headers={'Authorization': f'Bearer {token}'})
    assert ws_client.is_connected()

    ack = ws_client.emit('register', {}, callback=True)
    assert ack['status'] == 'success'
    assert 88 in connected_users

    ws_client.disconnect()
    assert 88 not in connected_users


def test_github_callback_post_success_updates_user_and_returns_contract(client, monkeypatch):
    parse_state = MagicMock(return_value='1')
    exchange_code = MagicMock(return_value={'access_token': 'token-abc'})
    get_profile = MagicMock(return_value={'login': 'octocat'})

    class StubUser:
        github_username = None

    user = StubUser()

    class StubUserModel:
        query = MagicMock()

    class StubGitHubToken:
        query = MagicMock()

        def __init__(self, user_id, access_token, refresh_token=None, token_expires_at=None):
            self.user_id = user_id
            self.access_token = access_token
            self.refresh_token = refresh_token
            self.token_expires_at = token_expires_at

    StubUserModel.query.get.return_value = user
    token_filter = MagicMock()
    token_filter.first.return_value = None
    StubGitHubToken.query.filter_by.return_value = token_filter
    session = MagicMock()

    monkeypatch.setattr(github_routes.GitHubClient, 'parse_state_param', parse_state)
    monkeypatch.setattr(github_routes.GitHubClient, 'exchange_code_for_token', exchange_code)
    monkeypatch.setattr(github_routes.GitHubClient, 'get_user_profile', get_profile)
    monkeypatch.setattr(github_routes, 'User', StubUserModel)
    monkeypatch.setattr(github_routes, 'GitHubToken', StubGitHubToken)
    monkeypatch.setattr(github_routes.db, 'session', session, raising=False)
    github_routes.oauth_states.clear()

    response = client.post(
        '/api/v1/github/callback',
        json={'code': 'valid-code', 'state': 'valid-state'},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['github_username'] == 'octocat'
    assert user.github_username == 'octocat'

    parse_state.assert_called_once_with('valid-state')
    exchange_code.assert_called_once_with('valid-code')
    session.add.assert_called_once()
    session.commit.assert_called_once_with()
