import os
import sys
from unittest.mock import MagicMock

import pytest
from flask import Blueprint, Flask

from backend.src.api.routes import admin_routes

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

    monkeypatch.setattr(admin_routes, 'jwt_required', passthrough_decorator)
    monkeypatch.setattr(admin_routes, 'admin_required', passthrough_decorator)
    monkeypatch.setattr(admin_routes, 'role_at_least', passthrough_decorator)
    monkeypatch.setattr(admin_routes, 'validate_json', passthrough_decorator)
    monkeypatch.setattr(admin_routes, 'rate_limit', passthrough_decorator)

    bp = Blueprint('api', __name__, url_prefix='/api/v1')
    admin_routes.register_routes(bp)
    app.register_blueprint(bp)

    return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_admin_routes_registered(app):
    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert '/api/v1/admin/stats' in rules
    assert '/api/v1/admin/settings' in rules
    assert '/api/v1/admin/users/<int:user_id>/role' in rules


def test_system_stats_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'users': {'total': 5}, 'projects': {'total': 10}}, 200))
    monkeypatch.setattr(admin_routes, 'get_system_stats', handler)

    response = client.get('/api/v1/admin/stats')

    assert response.status_code == 200
    assert response.get_json()['users']['total'] == 5
    handler.assert_called_once_with()


def test_get_system_settings_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'settings': {'app_name': 'DevSync'}}, 200))
    monkeypatch.setattr(admin_routes, 'get_system_settings', handler)

    response = client.get('/api/v1/admin/settings')

    assert response.status_code == 200
    assert response.get_json()['settings']['app_name'] == 'DevSync'
    handler.assert_called_once_with()


def test_update_system_settings_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'System settings updated successfully'}, 200))
    monkeypatch.setattr(admin_routes, 'update_system_settings', handler)

    response = client.put('/api/v1/admin/settings', json={'app_name': 'Updated DevSync'})

    assert response.status_code == 200
    assert response.get_json()['message'] == 'System settings updated successfully'
    handler.assert_called_once_with()


def test_update_user_role_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'message': 'User role updated successfully'}, 200))
    monkeypatch.setattr(admin_routes, 'update_user_role', handler)

    response = client.put('/api/v1/admin/users/1/role', json={'role': 'admin'})

    assert response.status_code == 200
    assert response.get_json()['message'] == 'User role updated successfully'
    handler.assert_called_once_with(1)