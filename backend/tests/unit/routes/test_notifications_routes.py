from unittest.mock import MagicMock

import pytest
from flask import Blueprint, Flask

from backend.src.api.routes import notifications_routes


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

    monkeypatch.setattr(notifications_routes, 'jwt_required', passthrough_decorator)
    monkeypatch.setattr(notifications_routes, 'validate_json', passthrough_decorator)

    bp = Blueprint('api', __name__, url_prefix='/api/v1')
    notifications_routes.register_routes(bp)
    app.register_blueprint(bp)

    return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_notifications_routes_registered(app):
    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert '/api/v1/notifications' in rules
    assert '/api/v1/notifications/<int:notification_id>/read' in rules
    assert '/api/v1/notifications/read-all' in rules
    assert '/api/v1/notifications/<int:notification_id>' in rules


def test_get_notifications_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'notifications': []}, 200))
    monkeypatch.setattr(notifications_routes, 'get_user_notifications', handler)

    response = client.get('/api/v1/notifications')

    assert response.status_code == 200
    assert response.get_json() == {'notifications': []}
    handler.assert_called_once_with()


def test_create_notification_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Created'}, 201))
    monkeypatch.setattr(notifications_routes, 'create_notification', handler)

    response = client.post('/api/v1/notifications', json={'content': 'Test notification', 'user_id': 1})

    assert response.status_code == 201
    assert response.get_json()['message'] == 'Created'
    handler.assert_called_once_with()


def test_mark_notification_read_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Marked as read'}, 200))
    monkeypatch.setattr(notifications_routes, 'mark_notification_read', handler)

    response = client.put('/api/v1/notifications/1/read')

    assert response.status_code == 200
    assert response.get_json()['message'] == 'Marked as read'
    handler.assert_called_once_with(1)


def test_mark_all_notifications_read_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'All marked as read'}, 200))
    monkeypatch.setattr(notifications_routes, 'mark_all_notifications_read', handler)

    response = client.put('/api/v1/notifications/read-all')

    assert response.status_code == 200
    assert response.get_json()['message'] == 'All marked as read'
    handler.assert_called_once_with()


def test_delete_notification_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'Deleted'}, 200))
    monkeypatch.setattr(notifications_routes, 'delete_notification', handler)

    response = client.delete('/api/v1/notifications/1')

    assert response.status_code == 200
    assert response.get_json()['message'] == 'Deleted'
    handler.assert_called_once_with(1)