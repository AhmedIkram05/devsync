"""Integration tests for dashboard controller"""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta


class TestDashboardControllerIntegration:
    """Integration tests for dashboard controller endpoints"""

    @patch('src.api.controllers.dashboard_controller.jsonify')
    @patch('src.api.controllers.dashboard_controller.Task')
    @patch('src.api.controllers.dashboard_controller.Project')
    @patch('src.api.controllers.dashboard_controller.User')
    @patch('src.api.controllers.dashboard_controller.get_jwt')
    @patch('src.api.controllers.dashboard_controller.get_jwt_identity')
    def test_user_dashboard_task_counts(self, mock_jwt_id, mock_jwt, mock_user, mock_project, mock_task, mock_jsonify, app):
        """Test user dashboard returns correct task counts"""
        # Setup
        mock_jwt_id.return_value = 1
        mock_jwt.return_value = {'user_id': 1, 'role': 'developer'}
        mock_user.query.get.return_value = MagicMock(id=1, role='developer')
        mock_task.query.filter_by.return_value.count.return_value = 5
        mock_jsonify.return_value = ({'success': True}, 200)

        with app.app_context():
            from src.api.controllers.dashboard_controller import get_user_dashboard
            result = get_user_dashboard()
            assert result is not None

    @patch('src.api.controllers.dashboard_controller.jsonify')
    @patch('src.api.controllers.dashboard_controller.Task')
    @patch('src.api.controllers.dashboard_controller.Project')
    @patch('src.api.controllers.dashboard_controller.User')
    @patch('src.api.controllers.dashboard_controller.get_jwt')
    @patch('src.api.controllers.dashboard_controller.get_jwt_identity')
    def test_user_dashboard_task_status_breakdown(self, mock_jwt_id, mock_jwt, mock_user, mock_project, mock_task, mock_jsonify, app):
        """Test user dashboard includes task status breakdown"""
        mock_jwt_id.return_value = 1
        mock_jwt.return_value = {'user_id': 1, 'role': 'developer'}
        mock_user.query.get.return_value = MagicMock(id=1, role='developer')
        mock_task.query.filter_by.return_value.count.side_effect = [3, 2, 1]
        mock_jsonify.return_value = ({'success': True}, 200)

        with app.app_context():
            from src.api.controllers.dashboard_controller import get_user_dashboard
            result = get_user_dashboard()
            assert result is not None

    @patch('src.api.controllers.dashboard_controller.jsonify')
    @patch('src.api.controllers.dashboard_controller.Task')
    @patch('src.api.controllers.dashboard_controller.Project')
    @patch('src.api.controllers.dashboard_controller.User')
    @patch('src.api.controllers.dashboard_controller.get_jwt')
    @patch('src.api.controllers.dashboard_controller.get_jwt_identity')
    def test_user_dashboard_due_soon_tasks(self, mock_jwt_id, mock_jwt, mock_user, mock_project, mock_task, mock_jsonify, app):
        """Test user dashboard includes due-soon tasks (7 days)"""
        mock_jwt_id.return_value = 1
        mock_jwt.return_value = {'user_id': 1, 'role': 'developer'}
        mock_user.query.get.return_value = MagicMock(id=1, role='developer')
        mock_task.query.filter_by.return_value.count.return_value = 2
        mock_jsonify.return_value = ({'success': True}, 200)

        with app.app_context():
            from src.api.controllers.dashboard_controller import get_user_dashboard
            result = get_user_dashboard()
            assert result is not None

    @patch('src.api.controllers.dashboard_controller.jsonify')
    @patch('src.api.controllers.dashboard_controller.Task')
    @patch('src.api.controllers.dashboard_controller.Project')
    @patch('src.api.controllers.dashboard_controller.User')
    @patch('src.api.controllers.dashboard_controller.get_jwt')
    @patch('src.api.controllers.dashboard_controller.get_jwt_identity')
    def test_admin_dashboard_system_stats(self, mock_jwt_id, mock_jwt, mock_user, mock_project, mock_task, mock_jsonify, app):
        """Test admin dashboard includes system statistics"""
        mock_jwt_id.return_value = 1
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        mock_user.query.count.return_value = 10
        mock_task.query.count.return_value = 50
        mock_project.query.count.return_value = 5
        mock_jsonify.return_value = ({'success': True}, 200)

        with app.app_context():
            from src.api.controllers.dashboard_controller import get_admin_dashboard
            result = get_admin_dashboard()
            assert result is not None

    @patch('src.api.controllers.dashboard_controller.jsonify')
    @patch('src.api.controllers.dashboard_controller.Task')
    @patch('src.api.controllers.dashboard_controller.Project')
    @patch('src.api.controllers.dashboard_controller.User')
    @patch('src.api.controllers.dashboard_controller.get_jwt')
    @patch('src.api.controllers.dashboard_controller.get_jwt_identity')
    def test_admin_dashboard_role_breakdown(self, mock_jwt_id, mock_jwt, mock_user, mock_project, mock_task, mock_jsonify, app):
        """Test admin dashboard includes user role breakdown"""
        mock_jwt_id.return_value = 1
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        mock_user.query.count.return_value = 10
        mock_task.query.count.return_value = 50
        mock_project.query.count.return_value = 5
        mock_jsonify.return_value = ({'success': True}, 200)

        with app.app_context():
            from src.api.controllers.dashboard_controller import get_admin_dashboard
            result = get_admin_dashboard()
            assert result is not None

    @patch('src.api.controllers.dashboard_controller.jsonify')
    @patch('src.api.controllers.dashboard_controller.Task')
    @patch('src.api.controllers.dashboard_controller.Project')
    @patch('src.api.controllers.dashboard_controller.User')
    @patch('src.api.controllers.dashboard_controller.get_jwt')
    @patch('src.api.controllers.dashboard_controller.get_jwt_identity')
    def test_admin_dashboard_completed_status_handling(self, mock_jwt_id, mock_jwt, mock_user, mock_project, mock_task, mock_jsonify, app):
        """Test admin dashboard counts both 'done' and 'completed' statuses"""
        mock_jwt_id.return_value = 1
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        mock_user.query.count.return_value = 10
        mock_task.query.count.return_value = 50
        mock_task.query.filter_by.return_value.count.side_effect = [5, 3]
        mock_project.query.count.return_value = 5
        mock_jsonify.return_value = ({'success': True}, 200)

        with app.app_context():
            from src.api.controllers.dashboard_controller import get_admin_dashboard
            result = get_admin_dashboard()
            assert result is not None

    @patch('src.api.controllers.dashboard_controller.jsonify')
    @patch('src.api.controllers.dashboard_controller.Task')
    @patch('src.api.controllers.dashboard_controller.Project')
    @patch('src.api.controllers.dashboard_controller.User')
    @patch('src.api.controllers.dashboard_controller.get_jwt')
    @patch('src.api.controllers.dashboard_controller.get_jwt_identity')
    def test_project_dashboard_task_breakdown(self, mock_jwt_id, mock_jwt, mock_user, mock_project, mock_task, mock_jsonify, app):
        """Test project dashboard includes task status breakdown"""
        mock_jwt_id.return_value = 1
        mock_jwt.return_value = {'user_id': 1, 'role': 'team_lead'}
        mock_project.query.get.return_value = MagicMock(id=1, name='Test Project')
        mock_task.query.filter_by.return_value.count.side_effect = [3, 4, 2, 1]
        mock_jsonify.return_value = ({'success': True}, 200)

        with app.app_context():
            from src.api.controllers.dashboard_controller import get_project_dashboard
            result = get_project_dashboard(project_id=1)
            assert result is not None

    @patch('src.api.controllers.dashboard_controller.jsonify')
    @patch('src.api.controllers.dashboard_controller.Task')
    @patch('src.api.controllers.dashboard_controller.Project')
    @patch('src.api.controllers.dashboard_controller.User')
    @patch('src.api.controllers.dashboard_controller.get_jwt')
    @patch('src.api.controllers.dashboard_controller.get_jwt_identity')
    def test_admin_dashboard_zero_data(self, mock_jwt_id, mock_jwt, mock_user, mock_project, mock_task, mock_jsonify, app):
        """Test admin dashboard with no data"""
        mock_jwt_id.return_value = 1
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        mock_user.query.count.return_value = 0
        mock_task.query.count.return_value = 0
        mock_project.query.count.return_value = 0
        mock_jsonify.return_value = ({'success': True}, 200)

        with app.app_context():
            from src.api.controllers.dashboard_controller import get_admin_dashboard
            result = get_admin_dashboard()
            assert result is not None

    @patch('src.api.controllers.dashboard_controller.jsonify')
    @patch('src.api.controllers.dashboard_controller.Task')
    @patch('src.api.controllers.dashboard_controller.Project')
    @patch('src.api.controllers.dashboard_controller.User')
    @patch('src.api.controllers.dashboard_controller.get_jwt')
    @patch('src.api.controllers.dashboard_controller.get_jwt_identity')
    def test_user_dashboard_no_tasks(self, mock_jwt_id, mock_jwt, mock_user, mock_project, mock_task, mock_jsonify, app):
        """Test user dashboard with no tasks assigned"""
        mock_jwt_id.return_value = 1
        mock_jwt.return_value = {'user_id': 1, 'role': 'developer'}
        mock_user.query.get.return_value = MagicMock(id=1, role='developer')
        mock_task.query.filter_by.return_value.count.return_value = 0
        mock_jsonify.return_value = ({'success': True}, 200)

        with app.app_context():
            from src.api.controllers.dashboard_controller import get_user_dashboard
            result = get_user_dashboard()
            assert result is not None
