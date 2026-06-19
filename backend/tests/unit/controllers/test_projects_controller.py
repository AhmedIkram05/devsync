import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask, jsonify

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SECRET_KEY"] = "test-secret-key"
    app.config["JWT_SECRET_KEY"] = "test-secret-key"
    app.config["JWT_TOKEN_LOCATION"] = ["headers"]

    yield app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def mock_jwt_identity():
    with patch("backend.src.api.controllers.projects_controller.get_jwt_identity") as mock:
        mock.return_value = {"user_id": 1}
        yield mock


@pytest.fixture
def mock_jwt():
    with patch("backend.src.api.controllers.projects_controller.get_jwt") as mock:
        mock.return_value = {"role": "admin"}
        yield mock


@pytest.fixture
def mock_db():
    with patch("backend.src.api.controllers.projects_controller.db") as mock:
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
    test_data = {"name": "New Project", "description": "Project Description"}

    # Use test_request_context with the JSON data
    with app.test_request_context(json=test_data):
        with (
            patch("backend.src.api.controllers.projects_controller.Project") as mock_project_class,
            patch("backend.src.api.controllers.projects_controller.validate_project_data") as mock_validate,
            patch("backend.src.api.controllers.projects_controller.User"),
        ):
            # Set up mocks
            mock_validate.return_value = None

            new_project = MagicMock()
            new_project.id = 1
            new_project.name = "New Project"
            new_project.status = "active"

            mock_project_class.return_value = new_project

            # Import locally to use patched modules
            from backend.src.api.controllers.projects_controller import create_project

            # Call the function
            response, status_code = create_project()

            # Assert results
            assert status_code == 201
            assert response.get_json()["project"]["name"] == "New Project"
            mock_db.session.add.assert_called_once()
            mock_db.session.commit.assert_called_once()


def test_get_project(app, mock_jwt_identity, mock_jwt, mock_project):
    with app.test_request_context():
        with (
            patch("backend.src.api.controllers.projects_controller.Project.query") as mock_query,
            patch("backend.src.api.controllers.projects_controller.User.query") as mock_user_query,
        ):
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
            assert "project" in data
            assert data["project"]["name"] == "Test Project"


def test_get_project_supports_list_backref_team_members(app, mock_jwt_identity, mock_jwt):
    with app.test_request_context():
        with (
            patch("backend.src.api.controllers.projects_controller.Project.query") as mock_query,
            patch("backend.src.api.controllers.projects_controller.User.query") as mock_user_query,
        ):
            project = MagicMock()
            project.id = 8
            project.name = "List Team Project"
            project.description = "Description"
            project.status = "active"
            project.github_repo = None
            project.created_by = 1
            project.created_at = MagicMock()
            project.created_at.isoformat.return_value = "2026-01-01T00:00:00"
            project.updated_at = MagicMock()
            project.updated_at.isoformat.return_value = "2026-01-02T00:00:00"
            member = MagicMock()
            member.id = 2
            member.name = "Dev One"
            member.role = "developer"
            project.team_members = [member]
            mock_query.get_or_404.return_value = project

            creator = MagicMock()
            creator.name = "Creator"
            mock_user_query.get.return_value = creator

            from backend.src.api.controllers.projects_controller import get_project_by_id

            response = get_project_by_id(8)

            payload = response.get_json()["project"]
            assert payload["id"] == 8
            assert payload["team_members"][0]["name"] == "Dev One"


def test_update_project(app, mock_jwt_identity, mock_jwt, mock_db, mock_project):
    # Create a test request context with JSON data
    test_data = {"name": "Updated Project"}

    # Use test_request_context with the JSON data
    with app.test_request_context(json=test_data):
        with (
            patch("backend.src.api.controllers.projects_controller.Project.query") as mock_query,
            patch("backend.src.api.controllers.projects_controller.validate_project_data") as mock_validate,
        ):
            # Set up mocks
            mock_validate.return_value = None
            mock_query.get_or_404.return_value = mock_project

            # Import locally to use patched modules
            from backend.src.api.controllers.projects_controller import update_project

            # Call the function
            response = update_project(1)

            # Assert results
            data = response.get_json()
            assert data["message"] == "Project updated successfully"
            assert data["project"]["name"] == "Updated Project"  # Changed to expect the updated name
            mock_db.session.commit.assert_called_once()


def test_update_project_clears_team_members(app, mock_jwt_identity, mock_jwt, mock_db):
    test_data = {"team_members": []}

    with app.test_request_context(json=test_data):
        with (
            patch("backend.src.api.controllers.projects_controller.Project.query") as mock_query,
            patch("backend.src.api.controllers.projects_controller.validate_project_data") as mock_validate,
        ):
            mock_validate.return_value = None
            mock_project = MagicMock()
            mock_project.id = 1
            mock_project.name = "Test Project"
            mock_project.status = "active"
            mock_project.team_members = [MagicMock()]
            mock_query.get_or_404.return_value = mock_project

            from backend.src.api.controllers.projects_controller import update_project

            response = update_project(1)

            data = response.get_json()
            assert data["message"] == "Project updated successfully"
            assert mock_project.team_members == []
            mock_db.session.commit.assert_called_once()


def test_delete_project(app, mock_jwt_identity, mock_jwt, mock_db):
    with app.test_request_context():
        with patch("backend.src.api.controllers.projects_controller.Project.query") as mock_query:
            mock_project = MagicMock()
            mock_query.get_or_404.return_value = mock_project

            # Import locally to use patched modules
            from backend.src.api.controllers.projects_controller import delete_project

            # Call the function
            response = delete_project(1)

            # Assert results
            assert response[0] == ""  # Empty response body
            assert response[1] == 204  # Status code
            mock_db.session.delete.assert_called_once_with(mock_project)
            mock_db.session.commit.assert_called_once()


def test_delete_project_with_tasks(app, mock_jwt_identity, mock_jwt, mock_db):
    with app.test_request_context():
        with patch("backend.src.api.controllers.projects_controller.Project.query") as mock_query:
            mock_project = MagicMock()
            mock_project.tasks = [MagicMock()]
            mock_query.get_or_404.return_value = mock_project

            from backend.src.api.controllers.projects_controller import delete_project

            response = delete_project(7)

            assert response[1] == 204
            mock_db.session.delete.assert_called_once_with(mock_project)
            mock_db.session.commit.assert_called_once()


def test_list_projects(app, mock_jwt_identity, mock_jwt):
    with app.test_request_context():
        with (
            patch("backend.src.api.controllers.projects_controller.Project.query") as mock_query,
            patch("backend.src.api.controllers.projects_controller.User.query"),
        ):
            # Set up mocks
            project = MagicMock()
            project.id = 1
            project.name = "Test Project"
            project.description = "Test description"
            project.status = "active"
            project.github_repo = "https://github.com/test/repo"
            project.created_by = 1
            project.created_at = MagicMock()
            project.created_at.isoformat.return_value = "2023-01-01T00:00:00"
            project.updated_at = MagicMock()
            project.updated_at.isoformat.return_value = "2023-01-02T00:00:00"

            mock_query.all.return_value = [project]

            # Import locally to use patched modules
            from backend.src.api.controllers.projects_controller import get_all_projects

            # Call the function
            response = get_all_projects()

            # Assert results
            data = response.get_json()
            assert "projects" in data
            assert isinstance(data["projects"], list)
            assert len(data["projects"]) == 1
            assert data["projects"][0]["name"] == "Test Project"


def test_get_all_projects_developer_scope(app, mock_db):
    user_project = MagicMock()
    user_project.id = 11
    user_project.name = "Developer Project"
    user_project.description = "Scoped to member"
    user_project.status = "active"
    user_project.github_repo = None
    user_project.created_by = 2
    user_project.created_at = MagicMock()
    user_project.created_at.isoformat.return_value = "2023-02-01T00:00:00"
    user_project.updated_at = MagicMock()
    user_project.updated_at.isoformat.return_value = "2023-02-02T00:00:00"
    user_project.team_members = MagicMock()
    user_project.team_members.all.return_value = []

    user = MagicMock()
    user.projects = MagicMock()
    user.projects.all.return_value = [user_project]

    with app.test_request_context():
        with (
            patch("backend.src.api.controllers.projects_controller.get_jwt_identity", return_value={"user_id": 2}),
            patch("backend.src.api.controllers.projects_controller.get_jwt", return_value={"role": "developer"}),
            patch("backend.src.api.controllers.projects_controller.settings_service.cleanup_completed_projects"),
            patch("backend.src.api.controllers.projects_controller.User") as mock_user_class,
            patch("backend.src.api.controllers.projects_controller.Project.query") as mock_query,
        ):
            mock_user_class.query.get.return_value = user
            mock_query.all.side_effect = AssertionError("developer path should not query all projects")

            from backend.src.api.controllers.projects_controller import get_all_projects

            response = get_all_projects()

    data = response.get_json()
    assert len(data["projects"]) == 1
    assert data["projects"][0]["id"] == 11


def test_get_project_by_id_denies_unassigned_developer(app):
    project = MagicMock()
    project.id = 5
    project.name = "Secret Project"
    project.description = "Restricted"
    project.status = "active"
    project.github_repo = None
    project.created_by = 1
    project.created_at = MagicMock()
    project.created_at.isoformat.return_value = "2023-03-01T00:00:00"
    project.updated_at = MagicMock()
    project.updated_at.isoformat.return_value = "2023-03-02T00:00:00"
    project.team_members = MagicMock()
    project.team_members.all.return_value = []

    user = MagicMock()
    user.projects = MagicMock()
    user.projects.all.return_value = []
    user.projects.__contains__.return_value = False

    with app.test_request_context():
        with (
            patch("backend.src.api.controllers.projects_controller.get_jwt_identity", return_value={"user_id": 9}),
            patch("backend.src.api.controllers.projects_controller.get_jwt", return_value={"role": "developer"}),
            patch("backend.src.api.controllers.projects_controller.Project.query") as mock_query,
            patch("backend.src.api.controllers.projects_controller.User") as mock_user_class,
        ):
            mock_query.get_or_404.return_value = project
            mock_user_class.query.get.side_effect = [user, MagicMock(name="creator")]

            from backend.src.api.controllers.projects_controller import get_project_by_id

            response, status = get_project_by_id(5)

    assert status == 403
    assert response.get_json()["message"] == "You do not have access to this project"


def test_create_project_with_team_members_and_repo(app, mock_db):
    test_data = {
        "name": "Team Project",
        "description": "Project Description",
        "status": "on_hold",
        "github_repo": "https://github.com/test/repo",
        "team_members": [2, 3],
    }

    member_one = MagicMock()
    member_one.id = 2
    member_two = MagicMock()
    member_two.id = 3
    project_instance = MagicMock()
    project_instance.id = 44
    project_instance.name = "Team Project"
    project_instance.status = "on_hold"
    project_instance.team_members = MagicMock()
    project_instance.team_members.__iter__.return_value = iter([])

    with app.test_request_context(json=test_data):
        with (
            patch("backend.src.api.controllers.projects_controller.Project", return_value=project_instance),
            patch("backend.src.api.controllers.projects_controller.validate_project_data", return_value=None),
            patch("backend.src.api.controllers.projects_controller.User") as mock_user_class,
            patch("backend.src.api.controllers.projects_controller.get_jwt_identity", return_value={"user_id": 4}),
            patch("backend.src.api.controllers.projects_controller.audit_service.record"),
            patch("backend.src.api.controllers.projects_controller.emit_dashboard_refresh"),
        ):
            mock_user_class.query.get.side_effect = [member_one, member_two]

            from backend.src.api.controllers.projects_controller import create_project

            response, status = create_project()

    assert status == 201
    assert response.get_json()["project"]["status"] == "on_hold"
    assert project_instance.team_members.append.call_count == 2
    mock_db.session.add.assert_called_once_with(project_instance)


def test_update_project_replaces_team_members_and_repo(app, mock_db, mock_project):
    new_member = MagicMock()
    new_member.id = 9

    with app.test_request_context(
        json={
            "description": "Updated",
            "status": "completed",
            "github_repo": "https://github.com/new/repo",
            "team_members": [9],
        }
    ):
        with (
            patch("backend.src.api.controllers.projects_controller.Project.query") as mock_query,
            patch("backend.src.api.controllers.projects_controller.validate_project_data", return_value=None),
            patch("backend.src.api.controllers.projects_controller.User") as mock_user_class,
            patch("backend.src.api.controllers.projects_controller.audit_service.record"),
            patch("backend.src.api.controllers.projects_controller.emit_dashboard_refresh"),
        ):
            mock_query.get_or_404.return_value = mock_project
            mock_user_class.query.get.return_value = new_member

            from backend.src.api.controllers.projects_controller import update_project

            response = update_project(1)
            data = response.get_json()

    assert data["project"]["status"] == "completed"
    assert mock_project.description == "Updated"
    assert mock_project.github_repo == "https://github.com/new/repo"
    assert len(mock_project.team_members) == 1
    assert mock_project.team_members[0] == new_member
    mock_db.session.commit.assert_called_once()


def test_get_project_tasks_denies_unassigned_developer(app):
    project = MagicMock()
    project.id = 6
    project.name = "Private Project"
    project.created_by = 1

    user = MagicMock()
    user.projects = MagicMock()
    user.projects.all.return_value = []
    user.projects.__contains__.return_value = False

    with app.test_request_context():
        with (
            patch("backend.src.api.controllers.projects_controller.get_jwt_identity", return_value={"user_id": 9}),
            patch("backend.src.api.controllers.projects_controller.get_jwt", return_value={"role": "developer"}),
            patch("backend.src.api.controllers.projects_controller.Project.query") as mock_query,
            patch("backend.src.api.controllers.projects_controller.User") as mock_user_class,
        ):
            mock_query.get_or_404.return_value = project
            mock_user_class.query.get.return_value = user

            from backend.src.api.controllers.projects_controller import get_project_tasks

            response, status = get_project_tasks(6)

    assert status == 403
