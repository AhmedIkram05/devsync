import os
import sys
from unittest.mock import MagicMock

import pytest
from flask import Blueprint, Flask

from backend.src.api.routes import comments_routes

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

    monkeypatch.setattr(comments_routes, 'jwt_required', passthrough_decorator)
    monkeypatch.setattr(comments_routes, 'role_required', passthrough_decorator)
    monkeypatch.setattr(comments_routes, 'validate_json', passthrough_decorator)

    bp = Blueprint('api', __name__, url_prefix='/api/v1')
    comments_routes.register_routes(bp)
    app.register_blueprint(bp)

    return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_comments_routes_registered(app):
    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert '/api/v1/tasks/<int:task_id>/comments' in rules
    assert '/api/v1/comments/<int:comment_id>' in rules


def test_get_task_comments_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'comments': []}, 200))
    monkeypatch.setattr(comments_routes, 'get_task_comments', handler)

    response = client.get('/api/v1/tasks/1/comments')

    assert response.status_code == 200
    assert response.get_json() == {'comments': []}
    handler.assert_called_once_with(1)


def test_add_comment_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Comment added successfully'}, 201))
    monkeypatch.setattr(comments_routes, 'add_comment', handler)

    response = client.post('/api/v1/tasks/1/comments', json={'content': 'New comment'})

    assert response.status_code == 201
    assert response.get_json()['message'] == 'Comment added successfully'
    handler.assert_called_once_with(1)


def test_update_comment_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Comment updated successfully'}, 200))
    monkeypatch.setattr(comments_routes, 'update_comment', handler)

    response = client.put('/api/v1/comments/1', json={'content': 'Updated comment'})

    assert response.status_code == 200
    assert response.get_json()['message'] == 'Comment updated successfully'
    handler.assert_called_once_with(1)


def test_delete_comment_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Comment deleted successfully'}, 200))
    monkeypatch.setattr(comments_routes, 'delete_comment', handler)

    response = client.delete('/api/v1/comments/1')

    assert response.status_code == 200
    assert response.get_json()['message'] == 'Comment deleted successfully'
    handler.assert_called_once_with(1)
