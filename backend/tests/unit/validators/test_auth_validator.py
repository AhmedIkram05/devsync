import sys
import os
import json
import unittest
from flask import Flask

# Create a test Flask app context for the validators to use
app = Flask(__name__)

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

# Import after path setup
from backend.src.api.validators.auth_validator import validate_login_data, validate_registration_data

class TestAuthValidator(unittest.TestCase):
    def test_login_validation(self):
        with app.test_request_context():
            # Test valid login data
            valid_data = {'email': 'test@example.com', 'password': 'password123'}
            assert validate_login_data(valid_data) is None
            
            # Test missing email
            missing_email = {'password': 'password123'}
            response, code = validate_login_data(missing_email)
            assert code == 400
            assert json.loads(response.data)['message'] == 'Email and password required'
            
            # Test missing password
            missing_password = {'email': 'test@example.com'}
            response, code = validate_login_data(missing_password)
            assert code == 400
            assert json.loads(response.data)['message'] == 'Email and password required'
            
            # Test invalid email format
            invalid_email = {'email': 'invalid-email', 'password': 'password123'}
            response, code = validate_login_data(invalid_email)
            assert code == 400
            assert json.loads(response.data)['message'] == 'Invalid email format'
    
    def test_registration_validation(self):
        with app.test_request_context():
            # Test valid registration data
            valid_data = {
                'name': 'Test User',
                'email': 'test@example.com',
                'password': 'password123',
                'role': 'developer'
            }
            assert validate_registration_data(valid_data) is None
            
            # Test missing required fields
            missing_fields = {
                'name': 'Test User',
                'email': 'test@example.com'
            }
            response, code = validate_registration_data(missing_fields)
            assert code == 400
            assert json.loads(response.data)['message'] == 'Missing required fields'
            
            # Test invalid email format
            invalid_email = {
                'name': 'Test User',
                'email': 'invalid-email',
                'password': 'password123',
                'role': 'developer'
            }
            response, code = validate_registration_data(invalid_email)
            assert code == 400
            assert json.loads(response.data)['message'] == 'Invalid email format'
            
            # Test password too short
            short_password = {
                'name': 'Test User',
                'email': 'test@example.com',
                'password': 'short',
                'role': 'developer'
            }
            response, code = validate_registration_data(short_password)
            assert code == 400
            assert json.loads(response.data)['message'] == 'Password must be at least 8 characters long'
            


if __name__ == '__main__':
    unittest.main()