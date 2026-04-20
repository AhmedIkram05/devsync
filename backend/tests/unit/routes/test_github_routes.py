from unittest.mock import MagicMock

import pytest
from flask import Blueprint, Flask

from backend.src.api.routes import github_routes


def passthrough_decorator(*_args, **_kwargs):
    def _decorator(fn):
        return fn

    return _decorator


@pytest.fixture
def app(monkeypatch):
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret-key'
    app.config['JWT_SECRET_KEY'] = 'jwt-secret-key'

    monkeypatch.setattr(github_routes, 'jwt_required', passthrough_decorator)
    monkeypatch.setattr(github_routes, 'validate_json', passthrough_decorator)

    bp = Blueprint('api', __name__, url_prefix='/api/v1')
    github_routes.register_routes(bp)
    app.register_blueprint(bp)

    return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_github_routes_registered(app):
    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert '/api/v1/github/config-check' in rules
    assert '/api/v1/github/auth' in rules
    assert '/api/v1/github/callback' in rules
    assert '/api/v1/github/repositories' in rules
    assert '/api/v1/github/repositories/<int:repo_id>/issues' in rules
    assert '/api/v1/github/repositories/<int:repo_id>/pulls' in rules
    assert '/api/v1/tasks/<int:task_id>/github' in rules
    assert '/api/v1/tasks/<int:task_id>/github/<int:link_id>' in rules
    assert '/api/v1/github/exchange' in rules
    assert '/api/v1/github/connect' in rules
    assert '/api/v1/github/status' in rules
    assert '/api/v1/github/disconnect' in rules


def test_github_config_check_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'configured': True}, 200))
    monkeypatch.setattr(github_routes, 'check_github_config', handler)

    response = client.get('/api/v1/github/config-check')

    assert response.status_code == 200
    assert response.get_json()['configured'] is True
    handler.assert_called_once_with()


def test_github_auth_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'authorization_url': 'https://github.com/auth-url'}, 200))
    monkeypatch.setattr(github_routes, 'initiate_github_auth', handler)

    response = client.get('/api/v1/github/auth')

    assert response.status_code == 200
    assert response.get_json()['authorization_url'] == 'https://github.com/auth-url'
    handler.assert_called_once_with()


def test_github_callback_get_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'success': True}, 200))
    monkeypatch.setattr(github_routes, 'github_callback', handler)

    response = client.get('/api/v1/github/callback?code=test-code&state=test-state')

    assert response.status_code == 200
    assert response.get_json()['success'] is True
    handler.assert_called_once_with()


def test_repositories_list_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'repositories': [{'id': 1, 'name': 'repo1'}]}, 200))
    monkeypatch.setattr(github_routes, 'get_github_repositories', handler)

    response = client.get('/api/v1/github/repositories')

    assert response.status_code == 200
    assert response.get_json()['repositories'][0]['name'] == 'repo1'
    handler.assert_called_once_with()


def test_add_repository_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Repository added successfully'}, 201))
    monkeypatch.setattr(github_routes, 'add_github_repository', handler)

    response = client.post(
        '/api/v1/github/repositories',
        json={'repository_name': 'owner/repo', 'repository_url': 'https://github.com/owner/repo'}
    )

    assert response.status_code == 201
    assert response.get_json()['message'] == 'Repository added successfully'
    handler.assert_called_once_with()


def test_repository_issues_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'issues': [{'id': 101, 'title': 'Test Issue'}]}, 200))
    monkeypatch.setattr(github_routes, 'get_repository_issues', handler)

    response = client.get('/api/v1/github/repositories/1/issues')

    assert response.status_code == 200
    assert response.get_json()['issues'][0]['title'] == 'Test Issue'
    handler.assert_called_once_with(1)


def test_repository_pulls_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'pull_requests': [{'id': 201, 'title': 'Test PR'}]}, 200))
    monkeypatch.setattr(github_routes, 'get_repository_pulls', handler)

    response = client.get('/api/v1/github/repositories/1/pulls')

    assert response.status_code == 200
    assert response.get_json()['pull_requests'][0]['title'] == 'Test PR'
    handler.assert_called_once_with(1)


def test_link_github_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Task linked with GitHub successfully'}, 200))
    monkeypatch.setattr(github_routes, 'link_task_with_github', handler)

    response = client.post('/api/v1/tasks/1/github', json={'repo_id': 2, 'issue_number': 3})

    assert response.status_code == 200
    assert response.get_json()['message'] == 'Task linked with GitHub successfully'
    handler.assert_called_once_with(1)


def test_get_github_links_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'links': [{'id': 1, 'task_id': 10}]}, 200))
    monkeypatch.setattr(github_routes, 'get_task_github_links', handler)

    response = client.get('/api/v1/tasks/10/github')

    assert response.status_code == 200
    assert response.get_json()['links'][0]['task_id'] == 10
    handler.assert_called_once_with(10)


def test_delete_github_link_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'GitHub link removed from task'}, 200))
    monkeypatch.setattr(github_routes, 'delete_task_github_link', handler)

    response = client.delete('/api/v1/tasks/10/github/1')

    assert response.status_code == 200
    assert response.get_json()['message'] == 'GitHub link removed from task'
    handler.assert_called_once_with(10, 1)


def test_disconnect_github_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'success': True}, 200))
    monkeypatch.setattr(github_routes, 'disconnect_github_account', handler)

    response = client.post('/api/v1/github/disconnect')

    assert response.status_code == 200
    assert response.get_json()['success'] is True
    handler.assert_called_once_with()
