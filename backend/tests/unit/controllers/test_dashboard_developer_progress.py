import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SECRET_KEY"] = "test-secret-key"
    app.config["JWT_SECRET_KEY"] = "test-secret-key"
    app.config["JWT_TOKEN_LOCATION"] = ["headers"]
    yield app


def _user(uid, name, role):
    user = MagicMock()
    user.id = uid
    user.name = name
    user.role = role
    return user


def test_developer_progress_counts_from_group_by(app):
    """Counts come from one GROUP BY; no per-task rows are loaded."""
    users = [_user(1, "Admin", "admin"), _user(2, "Dev", "developer")]

    with app.test_request_context():
        with (
            patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 2}),
            patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "developer"}),
            patch("backend.src.api.controllers.dashboard_controller.db") as mock_db,
            patch("backend.src.api.controllers.dashboard_controller.User") as mock_user,
            patch("backend.src.api.controllers.dashboard_controller.Task") as mock_task,
            patch("backend.src.api.controllers.dashboard_controller.joinedload", side_effect=lambda rel: rel),
        ):
            mock_user.query.filter.return_value.all.return_value = users
            mock_db.session.query.return_value.group_by.return_value.all.return_value = [
                (1, "done", 1),
                (2, "in_progress", 1),
                (2, "completed", 2),
            ]
            mock_task.query.options.return_value.filter_by.return_value.order_by.return_value.limit.return_value.all.return_value = []

            from backend.src.api.controllers.dashboard_controller import get_developer_progress

            response = get_developer_progress()

            data = response.get_json()
            assert [d["id"] for d in data["developers"]] == [1, 2]
            admin, dev = data["developers"]
            assert (admin["total_tasks"], admin["completed_tasks"], admin["active_tasks"]) == (1, 1, 0)
            assert (dev["total_tasks"], dev["completed_tasks"], dev["active_tasks"]) == (3, 2, 1)


def test_developer_progress_team_lead_without_projects_is_empty(app):
    with app.test_request_context():
        with (
            patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 9}),
            patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "team_lead"}),
            patch("backend.src.api.controllers.dashboard_controller.db") as mock_db,
        ):
            # No projects owned or joined -> short-circuit before touching users.
            mock_db.session.query.return_value.outerjoin.return_value.filter.return_value.all.return_value = []

            from backend.src.api.controllers.dashboard_controller import get_developer_progress

            response = get_developer_progress()

            assert response.get_json() == {"developers": []}


def test_developer_progress_team_lead_scopes_to_project_members(app):
    users = [_user(2, "Dev", "developer")]

    with app.test_request_context():
        with (
            patch("backend.src.api.controllers.dashboard_controller.get_jwt_identity", return_value={"user_id": 9}),
            patch("backend.src.api.controllers.dashboard_controller.get_jwt", return_value={"role": "team_lead"}),
            patch("backend.src.api.controllers.dashboard_controller.db") as mock_db,
            patch("backend.src.api.controllers.dashboard_controller.User") as mock_user,
            # Only Task.query is stubbed (not the Task class): or_()/in_() need
            # real column expressions for the scoped counts query.
            patch("backend.src.api.controllers.dashboard_controller.Task.query") as mock_task_query,
            patch("backend.src.api.controllers.dashboard_controller.joinedload", side_effect=lambda rel: rel),
        ):
            # Owned projects query, then members query, then scoped counts query.
            projects_result = MagicMock()
            projects_result.outerjoin.return_value.filter.return_value.all.return_value = [(100,)]
            members_result = MagicMock()
            members_result.filter.return_value.all.return_value = [(2,)]
            counts_result = MagicMock()
            counts_result.filter.return_value.group_by.return_value.all.return_value = [(2, "done", 1)]
            mock_db.session.query.side_effect = [projects_result, members_result, counts_result]

            mock_user.query.filter.return_value.filter.return_value.all.return_value = users
            mock_task_query.options.return_value.filter_by.return_value.order_by.return_value.limit.return_value.all.return_value = []

            from backend.src.api.controllers.dashboard_controller import get_developer_progress

            response = get_developer_progress()

            data = response.get_json()
            assert [d["id"] for d in data["developers"]] == [2]
            assert data["developers"][0]["total_tasks"] == 1
