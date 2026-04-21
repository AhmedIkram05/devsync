import os
import sys
from unittest.mock import MagicMock

import pytest
from flask import Blueprint, Flask

from backend.src.api.routes import dashboard_routes

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

    monkeypatch.setattr(dashboard_routes, 'jwt_required', passthrough_decorator)
    monkeypatch.setattr(dashboard_routes, 'role_required', passthrough_decorator)

    bp = Blueprint('api', __name__, url_prefix='/api/v1')
    dashboard_routes.register_routes(bp)
    app.register_blueprint(bp)

    return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_dashboard_routes_registered(app):
    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert '/api/v1/dashboard' in rules
    assert '/api/v1/dashboard/client' in rules
    assert '/api/v1/dashboard/admin' in rules
    assert '/api/v1/dashboard/projects/<int:project_id>' in rules


def test_user_dashboard_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'user': {'id': 1}, 'tasks': {}, 'projects': []}, 200))
    monkeypatch.setattr(dashboard_routes, 'get_user_dashboard', handler)

    response = client.get('/api/v1/dashboard')

    assert response.status_code == 200
    assert 'user' in response.get_json()
    handler.assert_called_once_with()


def test_client_dashboard_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'projects': []}, 200))
    monkeypatch.setattr(dashboard_routes, 'get_client_dashboard', handler)

    response = client.get('/api/v1/dashboard/client')

    assert response.status_code == 200
    assert response.get_json() == {'projects': []}
    handler.assert_called_once_with()


def test_admin_dashboard_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'stats': {'total_users': 5}}, 200))
    monkeypatch.setattr(dashboard_routes, 'get_admin_dashboard', handler)

    response = client.get('/api/v1/dashboard/admin')

    assert response.status_code == 200
    assert response.get_json()['stats']['total_users'] == 5
    handler.assert_called_once_with()


def test_project_dashboard_route_calls_controller(monkeypatch, client):
    handler = MagicMock(return_value=({'project': {'id': 1}}, 200))
    monkeypatch.setattr(dashboard_routes, 'get_project_dashboard', handler)

    response = client.get('/api/v1/dashboard/projects/1')

    assert response.status_code == 200
    assert response.get_json()['project']['id'] == 1
    handler.assert_called_once_with(1)