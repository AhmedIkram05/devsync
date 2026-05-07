import sys
import os
import pytest
from unittest.mock import patch, MagicMock
from flask import Flask, jsonify

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

@pytest.fixture
def app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret-key'
    app.config['JWT_SECRET_KEY'] = 'test-secret-key'
    app.config['JWT_TOKEN_LOCATION'] = ['headers']
    
    yield app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def mock_jwt_identity():
    with patch('backend.src.api.controllers.tasks_controller.get_jwt_identity') as mock:
        mock.return_value = {'user_id': 1}
        yield mock

@pytest.fixture
def mock_jwt():
    with patch('backend.src.api.controllers.tasks_controller.get_jwt') as mock:
        mock.return_value = {'role': 'admin'}  # Default to admin for most tests
        yield mock

@pytest.fixture
def mock_db():
    with patch('backend.src.api.controllers.tasks_controller.db') as mock:
        yield mock

@pytest.fixture
def mock_task():
    task = MagicMock()
    task.id = 1
    task.title = "Test Task"
    task.description = "Test Description"
    task.status = "in_progress"
    task.progress = 50
    task.assigned_to = 2
    task.created_by = 1
    task.deadline = MagicMock()
    task.deadline.isoformat.return_value = "2023-01-15T00:00:00"
    task.created_at = MagicMock()
    task.created_at.isoformat.return_value = "2023-01-01T00:00:00"
    task.updated_at = MagicMock()
    task.updated_at.isoformat.return_value = "2023-01-02T00:00:00"
    return task

def test_get_all_tasks_admin(app, mock_jwt_identity, mock_jwt):
    with app.test_request_context('?status=in_progress'):
        with patch('backend.src.api.controllers.tasks_controller.Task.query') as mock_query:
            # Set up mock task with all required attributes for serialization
            task1 = MagicMock()
            task1.id = 1
            task1.title = "Task 1"
            task1.description = "Description 1"
            task1.status = "in_progress"
            task1.progress = 50
            task1.assigned_to = 2
            task1.created_by = 1
            task1.deadline = None
            task1.created_at = MagicMock()
            task1.created_at.isoformat.return_value = "2023-01-01T00:00:00"
            task1.updated_at = MagicMock()
            task1.updated_at.isoformat.return_value = "2023-01-02T00:00:00"
            
            # Configure the mock query
            mock_filtered_query = MagicMock()
            mock_query.filter.return_value = mock_filtered_query
            mock_filtered_query.all.return_value = [task1]
            mock_query.all.return_value = [task1]
            
            # Import the function locally to use patched modules
            from backend.src.api.controllers.tasks_controller import get_all_tasks
            
            # Call the function
            response = get_all_tasks()
            
            # Assert the results
            data = response.get_json()
            assert 'tasks' in data
            assert len(data['tasks']) == 1
            assert data['tasks'][0]['title'] == "Task 1"
            assert data['tasks'][0]['status'] == "in_progress"

def test_get_all_tasks_developer(app, mock_jwt_identity, mock_jwt):
    # Set developer role
    mock_jwt.return_value = {'role': 'developer'}
    
    with app.test_request_context():
        with patch('backend.src.api.controllers.tasks_controller.Task.query') as mock_query:
            # Configure filter for developer (assigned_to or created_by)
            filter_mock = MagicMock()
            mock_query.filter.return_value = filter_mock
            filter_mock.all.return_value = []
            
            # Import the function locally to use patched modules
            from backend.src.api.controllers.tasks_controller import get_all_tasks
            
            # Call the function
            response = get_all_tasks()
            
            # Assert that all() was called on the query (developers can now see all tasks)
            mock_query.all.assert_called_once()
            
            # Assert the results
            data = response.get_json()
            assert 'tasks' in data
            assert isinstance(data['tasks'], list)

def test_get_task_by_id(app, mock_jwt_identity, mock_jwt, mock_task):
    with app.test_request_context():
        with patch('backend.src.api.controllers.tasks_controller.Task.query') as mock_query, \
             patch('backend.src.api.controllers.tasks_controller.User.query') as mock_user_query:
            
            # Set up mocks
            mock_query.get_or_404.return_value = mock_task
            
            # Mock users
            creator = MagicMock()
            creator.name = "Creator User"
            
            assignee = MagicMock()
            assignee.name = "Assignee User"
            
            # Configure user query returns
            mock_user_query.get.side_effect = lambda id: creator if id == 1 else assignee if id == 2 else None
            
            # Import the function locally to use patched modules
            from backend.src.api.controllers.tasks_controller import get_task_by_id
            
            # Call the function
            response = get_task_by_id(1)
            
            # Assert the results
            data = response.get_json()
            assert 'task' in data
            assert data['task']['title'] == "Test Task"
            assert data['task']['creator_name'] == "Creator User"
            assert data['task']['assignee_name'] == "Assignee User"

def test_create_new_task(app, client, mock_jwt_identity, mock_jwt, mock_db):
    # Test data for task creation
    test_data = {
        'title': 'New Task',
        'description': 'Task Description',
        'status': 'todo',
        'progress': 0,
        'assigned_to': 2
    }
    
    # Use test_request_context with the JSON data
    with app.test_request_context(json=test_data):
        with patch('backend.src.api.controllers.tasks_controller.Task') as mock_task_class, \
             patch('backend.src.api.controllers.tasks_controller.validate_task_data') as mock_validate:
            
            # Set up mocks
            mock_validate.return_value = None
            
            new_task = MagicMock()
            new_task.id = 1
            new_task.title = 'New Task'
            new_task.status = 'todo'
            
            mock_task_class.return_value = new_task
            
            # Import the function locally to use patched modules
            from backend.src.api.controllers.tasks_controller import create_new_task
            
            # Call the function
            response, status_code = create_new_task()
            
            # Assert results
            assert status_code == 201
            assert response.get_json()['task']['title'] == 'New Task'
            mock_db.session.add.assert_called_once()
            mock_db.session.commit.assert_called_once()


def test_create_new_task_developer_forces_self_assignment(app, mock_jwt_identity, mock_db, mock_jwt):
    mock_jwt.return_value = {'role': 'developer'}

    test_data = {
        'title': 'New Task',
        'description': 'Task Description',
        'status': 'todo',
        'progress': 0,
        'assigned_to': 1,
    }

    with app.test_request_context(json=test_data):
        with patch('backend.src.api.controllers.tasks_controller.Task') as mock_task_class, \
             patch('backend.src.api.controllers.tasks_controller.validate_task_data') as mock_validate:

            mock_validate.return_value = None

            new_task = MagicMock()
            new_task.id = 1
            new_task.title = 'New Task'
            new_task.status = 'todo'

            mock_task_class.return_value = new_task

            from backend.src.api.controllers.tasks_controller import create_new_task

            response, status_code = create_new_task()

            assert status_code == 201
            assert response.get_json()['task']['title'] == 'New Task'
            assert new_task.assigned_to == 1
            mock_db.session.add.assert_called_once()
            mock_db.session.commit.assert_called_once()

def test_update_task_by_id(app, mock_jwt_identity, mock_jwt, mock_db, mock_task):
    # Test data for task update
    test_data = {'title': 'Updated Task', 'progress': 75}
    
    # Use test_request_context with the JSON data
    with app.test_request_context(json=test_data):
        with patch('backend.src.api.controllers.tasks_controller.Task.query') as mock_query:
            
            # Set up mocks
            mock_query.get_or_404.return_value = mock_task
            
            # Import the function locally to use patched modules
            from backend.src.api.controllers.tasks_controller import update_task_by_id
            
            # Call the function
            response = update_task_by_id(1)
            
            # Assert results
            data = response.get_json()
            assert data['message'] == 'Task updated successfully'
            assert data['task']['title'] == 'Updated Task'
            assert data['task']['progress'] == 75
            mock_db.session.commit.assert_called_once()

def test_update_task_permission_denied(app, mock_jwt_identity, mock_jwt, mock_task):
    # Set developer role
    mock_jwt.return_value = {'role': 'developer'}
    
    # Change task assigned_to to be different from user_id
    mock_task.assigned_to = 999  # Different from mock_jwt_identity's user_id (1)
    
    # Test data for task update
    test_data = {'title': 'Updated Task'}
    
    # Use test_request_context with the JSON data
    with app.test_request_context(json=test_data):
        with patch('backend.src.api.controllers.tasks_controller.Task.query') as mock_query:
            
            # Set up mocks
            mock_query.get_or_404.return_value = mock_task
            
            # Import the function locally to use patched modules
            from backend.src.api.controllers.tasks_controller import update_task_by_id
            
            # Call the function
            response, status_code = update_task_by_id(1)
            
            # Assert results
            assert status_code == 403
            assert 'You can only update tasks assigned to you' in response.get_json()['message']

def test_team_lead_can_assign_unassigned_task(app, mock_jwt_identity, mock_jwt, mock_db, mock_task):
    mock_jwt.return_value = {'role': 'team_lead'}
    mock_task.assigned_to = None

    with app.test_request_context(json={'assigned_to': 2}):
        with patch('backend.src.api.controllers.tasks_controller.Task.query') as mock_query:
            mock_query.get_or_404.return_value = mock_task

            from backend.src.api.controllers.tasks_controller import update_task_by_id

            response = update_task_by_id(1)

            assert response.get_json()['message'] == 'Task updated successfully'
            assert mock_task.assigned_to == 2
            mock_db.session.commit.assert_called_once()

def test_delete_task_by_id(app, mock_jwt_identity, mock_db):
    
    with app.test_request_context():
        with patch('backend.src.api.controllers.tasks_controller.Task.query') as mock_query, \
             patch('backend.src.api.controllers.tasks_controller.get_jwt') as mock_get_jwt:
            mock_get_jwt.return_value = {'role': 'admin'}
            
            mock_task = MagicMock()
            mock_query.get_or_404.return_value = mock_task
            
            # Import the function locally to use patched modules
            from backend.src.api.controllers.tasks_controller import delete_task_by_id
            
            # Call the function
            response = delete_task_by_id(1)
            
            # Assert results
            assert 'Task deleted successfully' in response.get_json()['message']
            mock_db.session.delete.assert_called_once_with(mock_task)
            mock_db.session.commit.assert_called_once()


def test_delete_task_permission_denied_for_non_owner(app, mock_jwt_identity, mock_db, mock_jwt):
    mock_jwt.return_value = {'role': 'developer'}

    with app.test_request_context():
        with patch('backend.src.api.controllers.tasks_controller.Task.query') as mock_query:
            mock_task = MagicMock()
            mock_task.assigned_to = 999
            mock_task.created_by = 998
            mock_query.get_or_404.return_value = mock_task

            from backend.src.api.controllers.tasks_controller import delete_task_by_id

            response, status_code = delete_task_by_id(1)

            assert status_code == 403
            assert 'You can only delete tasks assigned to you' in response.get_json()['message']
