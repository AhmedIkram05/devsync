import os
import sys
from unittest.mock import MagicMock

import pytest
from flask import Blueprint, Flask

from backend.src.api.routes import tasks_routes

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

    monkeypatch.setattr(tasks_routes, 'jwt_required', passthrough_decorator)
    monkeypatch.setattr(tasks_routes, 'validate_json', passthrough_decorator)
    monkeypatch.setattr(tasks_routes, 'role_required', passthrough_decorator)

    bp = Blueprint('api', __name__, url_prefix='/api/v1')
    tasks_routes.register_routes(bp)
    app.register_blueprint(bp)

    return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_task_routes_registered(app):
    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert '/api/v1/tasks' in rules
    assert '/api/v1/tasks/<int:task_id>' in rules


def test_get_all_tasks_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'tasks': []}, 200))
    monkeypatch.setattr(tasks_routes, 'get_all_tasks', handler)

    response = client.get('/api/v1/tasks')

    assert response.status_code == 200
    assert response.get_json() == {'tasks': []}
    handler.assert_called_once_with()


def test_create_task_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Task created'}, 201))
    monkeypatch.setattr(tasks_routes, 'create_new_task', handler)

    response = client.post('/api/v1/tasks', json={'title': 'Task', 'description': 'Desc', 'status': 'todo'})

    assert response.status_code == 201
    assert response.get_json()['message'] == 'Task created'
    handler.assert_called_once_with()


def test_get_task_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'task': {'id': 1}}, 200))
    monkeypatch.setattr(tasks_routes, 'get_task_by_id', handler)

    response = client.get('/api/v1/tasks/1')

    assert response.status_code == 200
    assert response.get_json()['task']['id'] == 1
    handler.assert_called_once_with(1)


def test_update_task_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Task updated'}, 200))
    monkeypatch.setattr(tasks_routes, 'update_task_by_id', handler)

    response = client.put('/api/v1/tasks/1', json={'title': 'Updated'})

    assert response.status_code == 200
    assert response.get_json()['message'] == 'Task updated'
    handler.assert_called_once_with(1)


def test_delete_task_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=('', 204))
    monkeypatch.setattr(tasks_routes, 'delete_task_by_id', handler)

    response = client.delete('/api/v1/tasks/1')

    assert response.status_code == 204
    handler.assert_called_once_with(1)