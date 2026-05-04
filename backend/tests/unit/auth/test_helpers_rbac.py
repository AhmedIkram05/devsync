import os
import sys
from unittest.mock import patch

from flask import Flask, jsonify

# Set up import path for backend package imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

from backend.src.auth.helpers import generate_tokens, hash_password, verify_password
from backend.src.auth.rbac import ROLE_PERMISSIONS, Role, require_permission, require_role


auth_test_app = Flask(__name__)


def test_hash_and_verify_password_roundtrip():
    password = 'super-secret-password'
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password('wrong-password', hashed) is False


def test_generate_tokens_with_explicit_claims():
    with patch('backend.src.auth.helpers.create_access_token', return_value='access-token') as access_mock:
        with patch('backend.src.auth.helpers.create_refresh_token', return_value='refresh-token') as refresh_mock:
            tokens = generate_tokens(42, {'role': 'admin'})

    assert tokens == {
        'access_token': 'access-token',
        'refresh_token': 'refresh-token',
    }
    access_mock.assert_called_once_with(identity={'user_id': 42}, additional_claims={'role': 'admin'})
    refresh_mock.assert_called_once_with(identity={'user_id': 42}, additional_claims={'role': 'admin'})


def test_generate_tokens_defaults_additional_claims_to_empty_dict():
    with patch('backend.src.auth.helpers.create_access_token', return_value='a') as access_mock:
        with patch('backend.src.auth.helpers.create_refresh_token', return_value='r') as refresh_mock:
            _ = generate_tokens(7)

    access_mock.assert_called_once_with(identity={'user_id': 7}, additional_claims={})
    refresh_mock.assert_called_once_with(identity={'user_id': 7}, additional_claims={})


def test_require_role_allows_matching_string_role():
    @require_role('admin')
    def protected_endpoint():
        return jsonify({'ok': True}), 200

    with auth_test_app.app_context():
        with patch('backend.src.auth.rbac.get_jwt', return_value={'role': 'admin'}):
            response, status = protected_endpoint()

    assert status == 200
    assert response.get_json() == {'ok': True}


def test_require_role_allows_matching_enum_role():
    @require_role(Role.DEVELOPER)
    def protected_endpoint():
        return jsonify({'ok': True}), 200

    with auth_test_app.app_context():
        with patch('backend.src.auth.rbac.get_jwt', return_value={'role': 'developer'}):
            response, status = protected_endpoint()

    assert status == 200
    assert response.get_json() == {'ok': True}


def test_require_role_rejects_missing_or_mismatched_role():
    @require_role('admin')
    def protected_endpoint():
        return jsonify({'ok': True}), 200

    with auth_test_app.app_context():
        with patch('backend.src.auth.rbac.get_jwt', return_value={}):
            missing_response, missing_status = protected_endpoint()

        with patch('backend.src.auth.rbac.get_jwt', return_value={'role': 'developer'}):
            denied_response, denied_status = protected_endpoint()

    assert missing_status == 403
    assert missing_response.get_json() == {'message': 'Insufficient role permissions'}
    assert denied_status == 403
    assert denied_response.get_json() == {'message': 'Insufficient role permissions'}


def test_require_permission_allows_permitted_role():
    @require_permission('can_manage_users')
    def protected_endpoint():
        return jsonify({'allowed': True}), 200

    with auth_test_app.app_context():
        with patch('backend.src.auth.rbac.get_jwt', return_value={'role': 'admin'}):
            response, status = protected_endpoint()

    assert status == 200
    assert response.get_json() == {'allowed': True}


def test_require_permission_rejects_unpermitted_role():
    @require_permission('can_manage_users')
    def protected_endpoint():
        return jsonify({'allowed': True}), 200

    with auth_test_app.app_context():
        with patch('backend.src.auth.rbac.get_jwt', return_value={'role': 'developer'}):
            response, status = protected_endpoint()

    assert status == 403
    assert response.get_json() == {'message': 'Insufficient permissions'}


def test_role_permissions_use_strict_three_role_model():
    assert set(ROLE_PERMISSIONS.keys()) == {'developer', 'team_lead', 'admin'}
    assert 'can_create_tasks' not in ROLE_PERMISSIONS[Role.DEVELOPER.value]
    assert 'can_create_tasks' in ROLE_PERMISSIONS[Role.TEAM_LEAD.value]
    assert 'can_assign_tasks' in ROLE_PERMISSIONS[Role.TEAM_LEAD.value]
    assert 'can_manage_users' in ROLE_PERMISSIONS[Role.ADMIN.value]
