import os
import sys
from unittest.mock import MagicMock

import pytest
from flask import Blueprint, Flask

from backend.src.api.routes import projects_routes

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

    monkeypatch.setattr(projects_routes, 'jwt_required', passthrough_decorator)
    monkeypatch.setattr(projects_routes, 'role_required', passthrough_decorator)
    monkeypatch.setattr(projects_routes, 'validate_json', passthrough_decorator)
    monkeypatch.setattr(projects_routes, 'log_api_usage', passthrough_decorator)
    monkeypatch.setattr(projects_routes, 'log_request', passthrough_decorator)

    bp = Blueprint('api', __name__, url_prefix='/api/v1')
    projects_routes.register_routes(bp)
    app.register_blueprint(bp)

    return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_projects_routes_registered(app):
    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert '/api/v1/projects' in rules
    assert '/api/v1/projects/<int:project_id>' in rules
    assert '/api/v1/projects/<int:project_id>/tasks' in rules


def test_get_all_projects_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'projects': []}, 200))
    monkeypatch.setattr(projects_routes, 'get_all_projects', handler)

    response = client.get('/api/v1/projects')

    assert response.status_code == 200
    assert response.get_json() == {'projects': []}
    handler.assert_called_once_with()


def test_create_project_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Project created'}, 201))
    monkeypatch.setattr(projects_routes, 'create_project', handler)

    response = client.post('/api/v1/projects', json={'name': 'Project A', 'description': 'Desc'})

    assert response.status_code == 201
    assert response.get_json()['message'] == 'Project created'
    handler.assert_called_once_with()


def test_get_project_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'project': {'id': 1}}, 200))
    monkeypatch.setattr(projects_routes, 'get_project_by_id', handler)

    response = client.get('/api/v1/projects/1')

    assert response.status_code == 200
    assert response.get_json()['project']['id'] == 1
    handler.assert_called_once_with(1)


def test_update_project_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Project updated'}, 200))
    monkeypatch.setattr(projects_routes, 'update_project', handler)

    response = client.put('/api/v1/projects/1', json={'name': 'Updated Project'})

    assert response.status_code == 200
    assert response.get_json()['message'] == 'Project updated'
    handler.assert_called_once_with(1)


def test_delete_project_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=('', 204))
    monkeypatch.setattr(projects_routes, 'delete_project', handler)

    response = client.delete('/api/v1/projects/1')

    assert response.status_code == 204
    handler.assert_called_once_with(1)


def test_get_project_tasks_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'tasks': []}, 200))
    monkeypatch.setattr(projects_routes, 'get_project_tasks', handler)

    response = client.get('/api/v1/projects/1/tasks')

    assert response.status_code == 200
    assert response.get_json() == {'tasks': []}
    handler.assert_called_once_with(1)