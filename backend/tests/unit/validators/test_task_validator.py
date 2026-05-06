import sys
import os
from flask import Flask, jsonify

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

# Import after path setup
from backend.src.api.validators.task_validator import validate_task_data

# Create a Flask app for testing context
app = Flask(__name__)

def test_missing_required_fields():
    """Test validation with missing required fields"""
    with app.test_request_context():
        # Missing description
        result = validate_task_data({'title': 'Test Task', 'status': 'todo'})
        response, status = result
        assert status == 400
        assert 'Missing required fields' in response.get_json()['message']
        
        # Missing title
        result = validate_task_data({'description': 'Test desc', 'status': 'todo'})
        response, status = result
        assert status == 400
        assert 'Missing required fields' in response.get_json()['message']
        
        # Missing status
        result = validate_task_data({'title': 'Test Task', 'description': 'Test desc'})
        response, status = result
        assert status == 400
        assert 'Missing required fields' in response.get_json()['message']

def test_invalid_title_length():
    """Test validation with invalid title length"""
    with app.test_request_context():
        # Title too short
        data = {'title': 'ab', 'description': 'Test Desc', 'status': 'todo'}
        result = validate_task_data(data)
        response, status = result
        assert status == 400
        assert 'Title must be between 3 and 100 characters' in response.get_json()['message']
        
        # Title too long
        data = {'title': 'a' * 101, 'description': 'Test Desc', 'status': 'todo'}
        result = validate_task_data(data)
        response, status = result
        assert status == 400
        assert 'Title must be between 3 and 100 characters' in response.get_json()['message']

def test_invalid_status():
    """Test validation with invalid status value"""
    with app.test_request_context():
        data = {'title': 'Valid Title', 'description': 'Test Desc', 'status': 'invalid_status'}
        result = validate_task_data(data)
        response, status = result
        assert status == 400
        assert 'Status must be one of:' in response.get_json()['message']

def test_invalid_progress():
    """Test validation with invalid progress value"""
    with app.test_request_context():
        # Progress below 0
        data = {'title': 'Valid Title', 'description': 'Test Desc', 'status': 'todo', 'progress': -10}
        result = validate_task_data(data)
        response, status = result
        assert status == 400
        assert 'Progress must be between 0 and 100' in response.get_json()['message']
        
        # Progress above 100
        data = {'title': 'Valid Title', 'description': 'Test Desc', 'status': 'todo', 'progress': 110}
        result = validate_task_data(data)
        response, status = result
        assert status == 400
        assert 'Progress must be between 0 and 100' in response.get_json()['message']

def test_invalid_priority():
    """Test validation with invalid priority value"""
    with app.test_request_context():
        data = {'title': 'Valid Title', 'description': 'Test Desc', 'status': 'todo', 'priority': 'invalid_priority'}
        result = validate_task_data(data)
        response, status = result
        assert status == 400
        assert 'Priority must be one of:' in response.get_json()['message']

def test_invalid_assignee_id():
    """Test validation with invalid assignee_id type"""
    with app.test_request_context():
        data = {'title': 'Valid Title', 'description': 'Test Desc', 'status': 'todo', 'assignee_id': 'string_id'}
        result = validate_task_data(data)
        response, status = result
        assert status == 400
        assert 'Assignee ID must be an integer' in response.get_json()['message']

def test_valid_data():
    """Test validation with fully valid data"""
    with app.test_request_context():
        # Minimal valid data
        data = {'title': 'Valid Title', 'description': 'Test Description', 'status': 'todo'}
        result = validate_task_data(data)
        assert result is None

        # Backlog should also be accepted on create
        data = {'title': 'Backlog Task', 'description': 'Queued work item', 'status': 'backlog'}
        result = validate_task_data(data)
        assert result is None
        
        # Complete valid data
        data = {
            'title': 'Valid Title',
            'description': 'Test Description',
            'status': 'in_progress',
            'progress': 50,
            'priority': 'high',
            'assignee_id': 123
        }
        result = validate_task_data(data)
        assert result is None