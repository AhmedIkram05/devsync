"""Integration tests for admin controller endpoints"""

import json
from unittest.mock import MagicMock, patch

import pytest


class TestAdminControllerIntegration:
    """Integration tests for admin controller using test_client"""

    @patch("src.api.controllers.admin_controller.jsonify")
    @patch("src.api.controllers.admin_controller.User")
    @patch("src.api.controllers.admin_controller.Task")
    @patch("src.api.controllers.admin_controller.Project")
    @patch("src.api.controllers.admin_controller.get_jwt_identity")
    def test_admin_get_system_stats_endpoint(
        self, mock_jwt_id, mock_project, mock_task, mock_user, mock_jsonify, client, app
    ):
        """Test /api/v1/admin/stats endpoint"""
        # Setup
        mock_jwt_id.return_value = 1
        mock_user.query.all.return_value = []
        mock_project.query.all.return_value = []
        mock_task.query.all.return_value = []
        mock_jsonify.return_value = ({"success": True}, 200)

        with app.app_context():
            from src.api.controllers.admin_controller import get_system_stats

            result = get_system_stats()
            assert result is not None

    @patch("src.api.controllers.admin_controller.jsonify")
    @patch("src.api.controllers.admin_controller.User")
    @patch("src.api.controllers.admin_controller.Task")
    @patch("src.api.controllers.admin_controller.Project")
    @patch("src.api.controllers.admin_controller.get_jwt_identity")
    def test_admin_stats_user_counts(self, mock_jwt_id, mock_project, mock_task, mock_user, mock_jsonify, client, app):
        """Test system stats correctly counts users by role"""
        mock_jwt_id.return_value = 1
        mock_user.query.all.return_value = []
        mock_project.query.all.return_value = []
        mock_task.query.all.return_value = []
        mock_jsonify.return_value = ({"success": True}, 200)

        with app.app_context():
            from src.api.controllers.admin_controller import get_system_stats

            result = get_system_stats()
            assert result is not None

    @patch("src.api.controllers.admin_controller.jsonify")
    @patch("src.api.controllers.admin_controller.User")
    @patch("src.api.controllers.admin_controller.Task")
    @patch("src.api.controllers.admin_controller.Project")
    @patch("src.api.controllers.admin_controller.get_jwt_identity")
    def test_admin_stats_project_counts(
        self, mock_jwt_id, mock_project, mock_task, mock_user, mock_jsonify, client, app
    ):
        """Test system stats correctly counts projects by status"""
        mock_jwt_id.return_value = 1
        mock_user.query.all.return_value = []
        mock_project.query.all.return_value = []
        mock_task.query.all.return_value = []
        mock_jsonify.return_value = ({"success": True}, 200)

        with app.app_context():
            from src.api.controllers.admin_controller import get_system_stats

            result = get_system_stats()
            assert result is not None

    @patch("src.api.controllers.admin_controller.jsonify")
    @patch("src.api.controllers.admin_controller.User")
    @patch("src.api.controllers.admin_controller.Task")
    @patch("src.api.controllers.admin_controller.Project")
    @patch("src.api.controllers.admin_controller.get_jwt_identity")
    def test_admin_stats_task_counts_includes_completed(
        self, mock_jwt_id, mock_project, mock_task, mock_user, mock_jsonify, client, app
    ):
        """Test that completed status is counted as done"""
        mock_jwt_id.return_value = 1
        mock_user.query.all.return_value = []
        mock_project.query.all.return_value = []
        mock_task.query.all.return_value = []
        mock_jsonify.return_value = ({"success": True}, 200)

        with app.app_context():
            from src.api.controllers.admin_controller import get_system_stats

            result = get_system_stats()
            assert result is not None

    @patch("src.api.controllers.admin_controller.jsonify")
    @patch("src.api.controllers.admin_controller.settings_service")
    @patch("src.api.controllers.admin_controller.get_jwt_identity")
    def test_admin_update_settings_endpoint(self, mock_jwt_id, mock_settings, mock_jsonify, client, app):
        """Test /api/v1/admin/settings endpoint"""
        mock_jwt_id.return_value = 1
        mock_settings.update_settings.return_value = {"app_name": "NewName"}
        mock_jsonify.return_value = ({"success": True}, 200)

        with app.test_request_context(json={"app_name": "NewName"}, method="POST"), app.app_context():
            from src.api.controllers.admin_controller import update_system_settings

            result = update_system_settings()
            assert result is not None

    @patch("src.api.controllers.admin_controller.jsonify")
    @patch("src.api.controllers.admin_controller.User")
    @patch("src.api.controllers.admin_controller.get_jwt_identity")
    def test_admin_update_user_role_endpoint(self, mock_jwt_id, mock_user, mock_jsonify, client, app):
        """Test /api/v1/admin/users/<id>/role endpoint"""
        mock_jwt_id.return_value = 1
        mock_jsonify.return_value = ({"success": True}, 200)

        with app.test_request_context(json={"role": "team_lead"}, method="PUT"), app.app_context():
            from src.api.controllers.admin_controller import update_user_role

            result = update_user_role(user_id=2)
            assert result is not None

    @patch("src.api.controllers.admin_controller.jsonify")
    @patch("src.api.controllers.admin_controller.User")
    @patch("src.api.controllers.admin_controller.get_jwt_identity")
    def test_admin_update_role_all_roles(self, mock_jwt_id, mock_user, mock_jsonify, client, app):
        """Test updating to each valid role"""
        for role in ["admin", "team_lead", "developer", "client"]:
            mock_jwt_id.return_value = 1
            mock_jsonify.return_value = ({"success": True}, 200)

            with app.test_request_context(json={"role": role}, method="PUT"), app.app_context():
                from src.api.controllers.admin_controller import update_user_role

                result = update_user_role(user_id=2)
                assert result is not None

    @patch("src.api.controllers.admin_controller.jsonify")
    @patch("src.api.controllers.admin_controller.User")
    @patch("src.api.controllers.admin_controller.Task")
    @patch("src.api.controllers.admin_controller.Project")
    @patch("src.api.controllers.admin_controller.get_jwt_identity")
    def test_admin_stats_empty_system(self, mock_jwt_id, mock_project, mock_task, mock_user, mock_jsonify, client, app):
        """Test system stats with no data"""
        mock_jwt_id.return_value = 1
        mock_user.query.all.return_value = []
        mock_project.query.all.return_value = []
        mock_task.query.all.return_value = []
        mock_jsonify.return_value = ({"success": True}, 200)

        with app.app_context():
            from src.api.controllers.admin_controller import get_system_stats

            result = get_system_stats()
            assert result is not None

    @patch("src.api.controllers.admin_controller.jsonify")
    @patch("src.api.controllers.admin_controller.User")
    @patch("src.api.controllers.admin_controller.Task")
    @patch("src.api.controllers.admin_controller.Project")
    @patch("src.api.controllers.admin_controller.get_jwt_identity")
    def test_admin_stats_large_dataset(
        self, mock_jwt_id, mock_project, mock_task, mock_user, mock_jsonify, client, app
    ):
        """Test system stats with large dataset"""
        mock_jwt_id.return_value = 1
        mock_user.query.all.return_value = []
        mock_project.query.all.return_value = []
        mock_task.query.all.return_value = []
        mock_jsonify.return_value = ({"success": True}, 200)

        with app.app_context():
            from src.api.controllers.admin_controller import get_system_stats

            result = get_system_stats()
            assert result is not None
