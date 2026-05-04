import os
import sys

from flask import Flask

from backend.src.api.middlewares import role_required
from backend.src.auth.rbac import Role

# Set up import path for backend package imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))


def test_role_required_allows_legacy_roles_for_client_family(monkeypatch):
    app = Flask(__name__)
    app.config['TESTING'] = True

    monkeypatch.setattr('backend.src.api.middlewares.verify_jwt_in_request', lambda: None)
    monkeypatch.setattr('backend.src.api.middlewares.get_jwt', lambda: {'role': 'developer'})

    @app.route('/client-family')
    @role_required([Role.CLIENT])
    def protected():
        return {'message': 'ok'}, 200

    client = app.test_client()
    response = client.get('/client-family')

    assert response.status_code == 200
    assert response.get_json()['message'] == 'ok'


def test_role_required_blocks_unlisted_role(monkeypatch):
    app = Flask(__name__)
    app.config['TESTING'] = True

    monkeypatch.setattr('backend.src.api.middlewares.verify_jwt_in_request', lambda: None)
    monkeypatch.setattr('backend.src.api.middlewares.get_jwt', lambda: {'role': 'client'})

    @app.route('/admin-only')
    @role_required([Role.ADMIN])
    def protected():
        return {'message': 'ok'}, 200

    client = app.test_client()
    response = client.get('/admin-only')

    assert response.status_code == 403
    assert response.get_json()['message'] == 'Insufficient permissions'
