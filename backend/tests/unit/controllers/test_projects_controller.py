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
    with patch('backend.src.api.controllers.projects_controller.get_jwt_identity') as mock:
        mock.return_value = {'user_id': 1}
        yield mock

@pytest.fixture
def mock_jwt():
    with patch('backend.src.api.controllers.projects_controller.get_jwt') as mock:
        mock.return_value = {'role': 'admin'}
        yield mock

@pytest.fixture
def mock_db():
    with patch('backend.src.api.controllers.projects_controller.db') as mock:
        yield mock

@pytest.fixture
def mock_project():
    project = MagicMock()
    project.id = 1
    project.name = "Test Project"
    project.description = "Test Description"
    project.status = "active"
    project.github_repo = "https://github.com/test/repo"
    project.created_by = 1
    project.created_at = MagicMock()
    project.created_at.isoformat.return_value = "2023-01-01T00:00:00"
    project.updated_at = MagicMock()
    project.updated_at.isoformat.return_value = "2023-01-02T00:00:00"
    project.team_members = MagicMock()
    project.team_members.all.return_value = []
    return project

def test_create_project(app, client, mock_jwt_identity, mock_db):
    # Create a test request context with JSON data
    test_data = {
        'name': 'New Project', 
        'description': 'Project Description'
    }
    
    # Use test_request_context with the JSON data
    with app.test_request_context(json=test_data):
        with patch('backend.src.api.controllers.projects_controller.Project') as mock_project_class, \
             patch('backend.src.api.controllers.projects_controller.validate_project_data') as mock_validate, \
             patch('backend.src.api.controllers.projects_controller.User') as mock_user_class:
            
            # Set up mocks
            mock_validate.return_value = None
            
            new_project = MagicMock()
            new_project.id = 1
            new_project.name = 'New Project'
            new_project.status = 'active'
            
            mock_project_class.return_value = new_project
            
            # Import locally to use patched modules
            from backend.src.api.controllers.projects_controller import create_project
            
            # Call the function
            response, status_code = create_project()
            
            # Assert results
            assert status_code == 201
            assert response.get_json()['project']['name'] == 'New Project'
            mock_db.session.add.assert_called_once()
            mock_db.session.commit.assert_called_once()

def test_get_project(app, mock_jwt_identity, mock_jwt, mock_project):
    with app.test_request_context():
        with patch('backend.src.api.controllers.projects_controller.Project.query') as mock_query, \
             patch('backend.src.api.controllers.projects_controller.User.query') as mock_user_query:
            
            # Set up mocks
            mock_query.get_or_404.return_value = mock_project
            
            user = MagicMock()
            user.name = "Test User"
            mock_user_query.get.return_value = user
            
            # Import locally to use patched modules
            from backend.src.api.controllers.projects_controller import get_project_by_id
            
            # Call the function
            response = get_project_by_id(1)
            
            # Assert results
            data = response.get_json()
            assert 'project' in data
            assert data['project']['name'] == 'Test Project'

def test_update_project(app, mock_jwt_identity, mock_jwt, mock_db, mock_project):
    # Create a test request context with JSON data
    test_data = {'name': 'Updated Project'}
    
    # Use test_request_context with the JSON data
    with app.test_request_context(json=test_data):
        with patch('backend.src.api.controllers.projects_controller.Project.query') as mock_query, \
             patch('backend.src.api.controllers.projects_controller.validate_project_data') as mock_validate:
            
            # Set up mocks
            mock_validate.return_value = None
            mock_query.get_or_404.return_value = mock_project
            
            # Import locally to use patched modules
            from backend.src.api.controllers.projects_controller import update_project
            
            # Call the function
            response = update_project(1)
            
            # Assert results
            data = response.get_json()
            assert data['message'] == 'Project updated successfully'
            assert data['project']['name'] == 'Updated Project'  # Changed to expect the updated name
            mock_db.session.commit.assert_called_once()

def test_delete_project(app, mock_jwt_identity, mock_jwt, mock_db):
    with app.test_request_context():
        with patch('backend.src.api.controllers.projects_controller.Project.query') as mock_query:
            
            mock_project = MagicMock()
            mock_query.get_or_404.return_value = mock_project
            
            # Import locally to use patched modules
            from backend.src.api.controllers.projects_controller import delete_project
            
            # Call the function
            response = delete_project(1)
            
            # Assert results
            assert response[0] == ''  # Empty response body
            assert response[1] == 204  # Status code
            mock_db.session.delete.assert_called_once_with(mock_project)
            mock_db.session.commit.assert_called_once()

def test_list_projects(app, mock_jwt_identity, mock_jwt):
    with app.test_request_context():
        with patch('backend.src.api.controllers.projects_controller.Project.query') as mock_query, \
             patch('backend.src.api.controllers.projects_controller.User.query') as mock_user_query:
            
            # Set up mocks
            project = MagicMock()
            project.id = 1
            project.name = 'Test Project'
            project.description = 'Test description'
            project.status = 'active'
            project.github_repo = 'https://github.com/test/repo'
            project.created_by = 1
            project.created_at = MagicMock()
            project.created_at.isoformat.return_value = '2023-01-01T00:00:00'
            project.updated_at = MagicMock()
            project.updated_at.isoformat.return_value = '2023-01-02T00:00:00'
            
            mock_query.all.return_value = [project]
            
            # Import locally to use patched modules
            from backend.src.api.controllers.projects_controller import get_all_projects
            
            # Call the function
            response = get_all_projects()
            
            # Assert results
            data = response.get_json()
            assert 'projects' in data
            assert isinstance(data['projects'], list)
            assert len(data['projects']) == 1
            assert data['projects'][0]['name'] == 'Test Project'