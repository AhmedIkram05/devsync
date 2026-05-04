import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

from flask import Flask
from sqlalchemy.exc import IntegrityError

# Set up import path for backend package imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

import backend.src.auth.auth as auth_module
import backend.src.db.models.models as models_module


def build_test_app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret-key'
    app.config['JWT_SECRET_KEY'] = 'test-jwt-secret'
    return app


class StubUser:
    query = MagicMock()

    def __init__(self, name, email, password, role):
        self.id = 55
        self.name = name
        self.email = email
        self.password = password
        self.role = role
        self.github_username = None


def test_register_returns_400_for_missing_fields(monkeypatch):
    app = build_test_app()

    with app.test_request_context(json={'email': 'incomplete@example.com'}):
        response, status = auth_module.register()

    assert status == 400
    assert response.get_json()['message'] == 'Missing required fields'


def test_register_returns_409_for_existing_email(monkeypatch):
    app = build_test_app()

    StubUser.query = MagicMock()
    StubUser.query.filter_by.return_value.first.return_value = object()
    monkeypatch.setattr(auth_module, 'User', StubUser)

    with app.test_request_context(
        json={
            'name': 'Test User',
            'email': 'existing@example.com',
            'password': 'password123',
            'role': 'developer',
        }
    ):
        response, status = auth_module.register()

    assert status == 409
    assert response.get_json()['message'] == 'Email already registered'


def test_register_success_sets_cookies_and_returns_contract(monkeypatch):
    app = build_test_app()

    StubUser.query = MagicMock()
    StubUser.query.filter_by.return_value.first.return_value = None

    session = MagicMock()
    hash_password = MagicMock(return_value='hashed-password')
    generate_tokens = MagicMock(return_value={'access_token': 'access-1', 'refresh_token': 'refresh-1'})
    set_access_cookies = MagicMock()
    set_refresh_cookies = MagicMock()

    monkeypatch.setattr(auth_module, 'User', StubUser)
    monkeypatch.setattr(auth_module, 'hash_password', hash_password)
    monkeypatch.setattr(auth_module, 'generate_tokens', generate_tokens)
    monkeypatch.setattr(auth_module.db, 'session', session, raising=False)
    monkeypatch.setattr(auth_module, 'set_access_cookies', set_access_cookies)
    monkeypatch.setattr(auth_module, 'set_refresh_cookies', set_refresh_cookies)

    with app.test_request_context(
        json={
            'name': 'New User',
            'email': 'new@example.com',
            'password': 'password123',
            'role': 'admin',
        }
    ):
        response, status = auth_module.register()

    assert status == 201
    payload = response.get_json()
    assert payload['message'] == 'User registered successfully'
    assert payload['user']['email'] == 'new@example.com'
    assert payload['user']['role'] == 'admin'

    hash_password.assert_called_once_with('password123')
    generate_tokens.assert_called_once_with(55, {'role': 'admin'})
    session.add.assert_called_once()
    session.commit.assert_called_once_with()
    set_access_cookies.assert_called_once_with(response, 'access-1')
    set_refresh_cookies.assert_called_once_with(response, 'refresh-1')


def test_register_handles_integrity_error(monkeypatch):
    app = build_test_app()

    StubUser.query = MagicMock()
    StubUser.query.filter_by.return_value.first.return_value = None

    session = MagicMock()
    session.commit.side_effect = IntegrityError('insert', {}, Exception('duplicate'))

    monkeypatch.setattr(auth_module, 'User', StubUser)
    monkeypatch.setattr(auth_module, 'hash_password', MagicMock(return_value='hashed-password'))
    monkeypatch.setattr(auth_module.db, 'session', session, raising=False)

    with app.test_request_context(
        json={
            'name': 'New User',
            'email': 'new@example.com',
            'password': 'password123',
            'role': 'developer',
        }
    ):
        response, status = auth_module.register()

    assert status == 500
    assert response.get_json()['message'] == 'An error occurred while registering the user'
    session.rollback.assert_called_once_with()


def test_login_returns_400_for_missing_fields():
    app = build_test_app()

    with app.test_request_context(json={'email': 'only-email@example.com'}):
        response, status = auth_module.login()

    assert status == 400
    assert response.get_json()['message'] == 'Missing email or password'


def test_login_returns_401_for_unknown_user(monkeypatch):
    app = build_test_app()

    StubUser.query = MagicMock()
    StubUser.query.filter_by.return_value.first.return_value = None
    monkeypatch.setattr(auth_module, 'User', StubUser)

    with app.test_request_context(json={'email': 'missing@example.com', 'password': 'password123'}):
        response, status = auth_module.login()

    assert status == 401
    assert response.get_json()['message'] == 'Invalid email or password'


def test_login_success_includes_github_connection_flags(monkeypatch):
    app = build_test_app()

    user = SimpleNamespace(
        id=7,
        name='Login User',
        email='login@example.com',
        password='stored-hash',
        role='developer',
        github_username='octocat',
    )

    StubUser.query = MagicMock()
    StubUser.query.filter_by.return_value.first.return_value = user

    class StubGitHubToken:
        query = MagicMock()

    StubGitHubToken.query.filter_by.return_value.first.return_value = object()

    generate_tokens = MagicMock(return_value={'access_token': 'access-2', 'refresh_token': 'refresh-2'})
    set_access_cookies = MagicMock()
    set_refresh_cookies = MagicMock()

    monkeypatch.setattr(auth_module, 'User', StubUser)
    monkeypatch.setattr(auth_module, 'verify_password', MagicMock(return_value=True))
    monkeypatch.setattr(auth_module, 'generate_tokens', generate_tokens)
    monkeypatch.setattr(auth_module, 'set_access_cookies', set_access_cookies)
    monkeypatch.setattr(auth_module, 'set_refresh_cookies', set_refresh_cookies)
    monkeypatch.setattr(models_module, 'GitHubToken', StubGitHubToken)

    with app.test_request_context(json={'email': 'login@example.com', 'password': 'password123'}):
        response = auth_module.login()

    payload = response.get_json()
    assert payload['message'] == 'Login successful'
    assert payload['user']['id'] == 7
    assert payload['user']['token'] == 'access-2'
    assert payload['user']['github_connected'] is True
    assert payload['user']['github_username'] == 'octocat'

    generate_tokens.assert_called_once_with(7, {'role': 'developer'})
    set_access_cookies.assert_called_once_with(response, 'access-2')
    set_refresh_cookies.assert_called_once_with(response, 'refresh-2')


def test_get_token_returns_400_for_missing_fields():
    app = build_test_app()

    with app.test_request_context(json={'email': 'only-email@example.com'}):
        response, status = auth_module.get_token()

    assert status == 400
    assert response.get_json()['message'] == 'Missing email or password'


def test_get_token_success_returns_minimal_token_contract(monkeypatch):
    app = build_test_app()

    user = SimpleNamespace(id=11, email='token@example.com', password='stored-hash', role='admin')

    StubUser.query = MagicMock()
    StubUser.query.filter_by.return_value.first.return_value = user

    set_access_cookies = MagicMock()
    set_refresh_cookies = MagicMock()

    monkeypatch.setattr(auth_module, 'User', StubUser)
    monkeypatch.setattr(auth_module, 'verify_password', MagicMock(return_value=True))
    monkeypatch.setattr(
        auth_module,
        'generate_tokens',
        MagicMock(return_value={'access_token': 'access-3', 'refresh_token': 'refresh-3'}),
    )
    monkeypatch.setattr(auth_module, 'set_access_cookies', set_access_cookies)
    monkeypatch.setattr(auth_module, 'set_refresh_cookies', set_refresh_cookies)

    with app.test_request_context(json={'email': 'token@example.com', 'password': 'password123'}):
        response = auth_module.get_token()

    payload = response.get_json()
    assert payload == {'token': 'access-3', 'user_id': 11, 'role': 'admin'}
    set_access_cookies.assert_called_once_with(response, 'access-3')
    set_refresh_cookies.assert_called_once_with(response, 'refresh-3')


def test_refresh_token_keeps_role_from_claims(monkeypatch):
    app = build_test_app()
    set_access_cookies = MagicMock()
    create_access_token = MagicMock(return_value='refreshed-access')

    monkeypatch.setattr(auth_module, 'get_jwt_identity', MagicMock(return_value={'user_id': 21}))
    monkeypatch.setattr(auth_module, 'get_jwt', MagicMock(return_value={'role': 'team_lead'}))
    monkeypatch.setattr(auth_module, 'create_access_token', create_access_token)
    monkeypatch.setattr(auth_module, 'set_access_cookies', set_access_cookies)

    with app.test_request_context():
        response = auth_module.refresh_token()

    payload = response.get_json()
    assert payload['message'] == 'Token refreshed successfully'
    assert payload['token'] == 'refreshed-access'
    create_access_token.assert_called_once_with(
        identity={'user_id': 21},
        additional_claims={'role': 'team_lead'}
    )
    set_access_cookies.assert_called_once_with(response, 'refreshed-access')


def test_refresh_token_backfills_missing_role_from_db_user(monkeypatch):
    app = build_test_app()
    set_access_cookies = MagicMock()
    create_access_token = MagicMock(return_value='refreshed-access')
    stub_user = SimpleNamespace(role='developer')
    stub_query = MagicMock()
    stub_query.get.return_value = stub_user
    stub_user_model = SimpleNamespace(query=stub_query)

    monkeypatch.setattr(auth_module, 'get_jwt_identity', MagicMock(return_value={'user_id': 34}))
    monkeypatch.setattr(auth_module, 'get_jwt', MagicMock(return_value={}))
    monkeypatch.setattr(auth_module, 'User', stub_user_model)
    monkeypatch.setattr(auth_module, 'create_access_token', create_access_token)
    monkeypatch.setattr(auth_module, 'set_access_cookies', set_access_cookies)

    with app.test_request_context():
        response = auth_module.refresh_token()

    payload = response.get_json()
    assert payload['token'] == 'refreshed-access'
    create_access_token.assert_called_once_with(
        identity={'user_id': 34},
        additional_claims={'role': 'developer'}
    )
    stub_query.get.assert_called_once_with(34)
    set_access_cookies.assert_called_once_with(response, 'refreshed-access')
