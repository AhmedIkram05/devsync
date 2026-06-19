import os
import sys

from flask import Flask, jsonify

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

# Import after path setup
from backend.src.api.validators.project_validator import validate_project_data

# Create a Flask app for testing context
app = Flask(__name__)

def test_missing_required_fields():
    with app.test_request_context():
        result = validate_project_data({'name': 'Test Project'})
        # Expect error for missing description field
        response, status = result
        assert status == 400
        assert 'Missing required fields' in response.get_json()['message']

def test_invalid_name_length():
    with app.test_request_context():
        data = {'name': 'ab', 'description': 'Test Desc'}
        result = validate_project_data(data)
        response, status = result
        assert status == 400
        assert 'Project name must be between 3 and 100 characters' in response.get_json()['message']

def test_valid_data_creation():
    with app.test_request_context():
        data = {'name': 'Valid Name', 'description': 'Test Desc'}
        result = validate_project_data(data)
        assert result is None

def test_valid_data_update():
    with app.test_request_context():
        data = {'status': 'active'}
        result = validate_project_data(data, update=True)
        assert result is None
