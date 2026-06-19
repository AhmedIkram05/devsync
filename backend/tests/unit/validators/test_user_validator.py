import os
import sys

from flask import Flask, jsonify

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

# Import after path setup
from backend.src.api.validators.user_validator import validate_profile_update, validate_user_data

# Create a Flask app for testing context
app = Flask(__name__)

def test_validate_user_data_email():
    """Test email validation in user data"""
    with app.test_request_context():
        # Valid email
        result = validate_user_data({'email': 'test@example.com'})
        assert result is None

        # Invalid email
        result = validate_user_data({'email': 'invalid-email'})
        response, status = result
        assert status == 400
        assert 'Invalid email format' in response.get_json()['message']

def test_validate_user_data_name():
    """Test name validation in user data"""
    with app.test_request_context():
        # Valid name
        result = validate_user_data({'name': 'John Doe'})
        assert result is None

        # Name too short
        result = validate_user_data({'name': 'J'})
        response, status = result
        assert status == 400
        assert 'Name must be between 2 and 100 characters' in response.get_json()['message']

        # Name too long
        result = validate_user_data({'name': 'J' * 101})
        response, status = result
        assert status == 400
        assert 'Name must be between 2 and 100 characters' in response.get_json()['message']

def test_validate_user_data_role():
    """Test role validation in user data"""
    with app.test_request_context():
        # Valid roles
        for role in ['developer', 'team_lead', 'admin']:
            result = validate_user_data({'role': role})
            assert result is None

        # Invalid role
        result = validate_user_data({'role': 'invalid_role'})
        response, status = result
        assert status == 400
        assert 'Role must be one of:' in response.get_json()['message']

def test_validate_user_data_password():
    """Test password validation in user data"""
    with app.test_request_context():
        # Valid password
        result = validate_user_data({'password': 'securepassword'})
        assert result is None

        # Password too short
        result = validate_user_data({'password': 'short'})
        response, status = result
        assert status == 400
        assert 'Password must be at least 8 characters long' in response.get_json()['message']

def test_validate_profile_update_email():
    """Test email validation in profile update"""
    with app.test_request_context():
        # Valid email
        result = validate_profile_update({'email': 'test@example.com'})
        assert result is None

        # Invalid email
        result = validate_profile_update({'email': 'invalid-email'})
        response, status = result
        assert status == 400
        assert 'Invalid email format' in response.get_json()['message']

def test_validate_profile_update_name():
    """Test name validation in profile update"""
    with app.test_request_context():
        # Valid name
        result = validate_profile_update({'name': 'John Doe'})
        assert result is None

        # Name too short
        result = validate_profile_update({'name': 'J'})
        response, status = result
        assert status == 400
        assert 'Name must be between 2 and 100 characters' in response.get_json()['message']

def test_validate_profile_update_password():
    """Test password change validation in profile update"""
    with app.test_request_context():
        # Valid password change
        result = validate_profile_update({
            'current_password': 'oldpassword',
            'new_password': 'newpassword'
        })
        assert result is None

        # Only current password provided
        result = validate_profile_update({'current_password': 'oldpassword'})
        response, status = result
        assert status == 400
        assert 'Both current password and new password are required' in response.get_json()['message']

        # Only new password provided
        result = validate_profile_update({'new_password': 'newpassword'})
        response, status = result
        assert status == 400
        assert 'Both current password and new password are required' in response.get_json()['message']

        # New password too short
        result = validate_profile_update({
            'current_password': 'oldpassword',
            'new_password': 'short'
        })
        response, status = result
        assert status == 400
        assert 'New password must be at least 8 characters long' in response.get_json()['message']

def test_valid_data():
    """Test validation with fully valid data"""
    with app.test_request_context():
        # Complete valid user data
        data = {
            'name': 'John Doe',
            'email': 'john@example.com',
            'role': 'developer',
            'password': 'securepassword'
        }
        result = validate_user_data(data)
        assert result is None

        # Complete valid profile update
        data = {
            'name': 'John Smith',
            'email': 'john@example.com',
            'current_password': 'oldpassword',
            'new_password': 'newpassword'
        }
        result = validate_profile_update(data)
        assert result is None
