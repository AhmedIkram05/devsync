import json
import os
import sys
import unittest

from flask import Flask, jsonify

# Create a test Flask app context for the validators to use
app = Flask(__name__)

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

# Import after path setup
from backend.src.api.validators.admin_validator import validate_system_settings, validate_user_role_update
from backend.src.auth.rbac import Role


class TestAdminValidator(unittest.TestCase):
    def test_admin_validation(self):
        with app.test_request_context():
            # Test validate_user_role_update
            # Valid role - note that roles in src/auth/rbac.py are lowercase
            valid_role_data = {'role': 'admin'}
            assert validate_user_role_update(valid_role_data) is None

            # Missing role
            missing_role_data = {}
            response, code = validate_user_role_update(missing_role_data)
            assert code == 400
            assert json.loads(response.data)['message'] == 'Role is required'

            # Invalid role
            invalid_role_data = {'role': 'INVALID_ROLE'}
            response, code = validate_user_role_update(invalid_role_data)
            assert code == 400
            assert 'Role must be one of' in json.loads(response.data)['message']

    def test_admin_data(self):
        with app.test_request_context():
            # Test validate_system_settings
            # Valid settings - note roles are lowercase
            valid_settings = {
                'app_name': 'DevSync Test',
                'allow_registration': True,
                'default_user_role': 'developer',  # lowercase to match enum value
                'github_integration_enabled': True,
                'notification_settings': {
                    'email_notifications': True,
                    'task_assignments': False
                }
            }
            assert validate_system_settings(valid_settings) is None

            # Empty data
            response, code = validate_system_settings(None)
            assert code == 400

            # Invalid app_name
            invalid_app_name = {'app_name': 'A'}  # Too short
            response, code = validate_system_settings(invalid_app_name)
            assert code == 400
            assert 'App name must be between' in json.loads(response.data)['message']

            # Invalid allow_registration
            invalid_registration = {'allow_registration': 'yes'}  # Not boolean
            response, code = validate_system_settings(invalid_registration)
            assert code == 400
            assert 'allow_registration must be a boolean' in json.loads(response.data)['message']

            # Invalid default_user_role
            invalid_role = {'default_user_role': 'SUPERHERO'}  # Not a valid role
            response, code = validate_system_settings(invalid_role)
            assert code == 400
            assert 'Default user role must be one of' in json.loads(response.data)['message']

            # Invalid notification_settings
            invalid_notifications = {'notification_settings': 'all'}  # Not a dict
            response, code = validate_system_settings(invalid_notifications)
            assert code == 400
            assert 'notification_settings must be an object' in json.loads(response.data)['message']

            # Invalid notification_setting value
            invalid_notification_value = {'notification_settings': {'email_notifications': 'yes'}}  # Not boolean
            response, code = validate_system_settings(invalid_notification_value)
            assert code == 400
            assert 'must be a boolean value' in json.loads(response.data)['message']

if __name__ == "__main__":
    unittest.main()
