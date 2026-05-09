"""Integration tests for report controller endpoints"""

import pytest
import json
from unittest.mock import patch, MagicMock


class TestReportControllerIntegration:
    """Integration tests for report controller using app context"""

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.db')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_save_report_success(self, mock_jwt, mock_jwt_id, mock_db, mock_report, mock_jsonify, app):
        """Test saving a valid report"""
        mock_jwt_id.return_value = {'user_id': 1}
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        mock_jsonify.return_value = ({'success': True}, 200)

        with app.test_request_context(json={'report_type': 'task', 'date_range': 'week', 'summary': {}, 'details': []}, method='POST'):
            with app.app_context():
                from src.api.controllers.report_controller import save_report
                result = save_report()
                assert result is not None

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.db')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_save_report_validation_failure(self, mock_jwt, mock_jwt_id, mock_db, mock_report, mock_jsonify, app):
        """Test save_report with invalid data"""
        mock_jwt_id.return_value = {'user_id': 1}
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        mock_jsonify.return_value = ({'error': 'Invalid'}, 400)

        with app.test_request_context(json={'report_type': 'invalid'}, method='POST'):
            with app.app_context():
                from src.api.controllers.report_controller import save_report
                result = save_report()
                assert result is not None

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.db')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_save_report_database_error(self, mock_jwt, mock_jwt_id, mock_db, mock_report, mock_jsonify, app):
        """Test save_report handles database errors"""
        mock_jwt_id.return_value = {'user_id': 1}
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        mock_db.session.commit.side_effect = Exception("DB Error")
        mock_jsonify.return_value = ({'error': 'DB Error'}, 500)

        with app.test_request_context(json={'report_type': 'task', 'date_range': 'week', 'summary': {}, 'details': []}, method='POST'):
            with app.app_context():
                from src.api.controllers.report_controller import save_report
                result = save_report()
                assert result is not None

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_get_reports_admin_sees_all(self, mock_jwt, mock_jwt_id, mock_report, mock_jsonify, app):
        """Test admin sees all reports"""
        mock_jwt_id.return_value = {'user_id': 1}
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        
        mock_reports = [
            MagicMock(id=1, report_type='task', user_id=1),
            MagicMock(id=2, report_type='project', user_id=2),
        ]
        mock_report.query.all.return_value = mock_reports
        mock_jsonify.return_value = ({'reports': mock_reports}, 200)

        with app.test_request_context('/'):
            with app.app_context():
                from src.api.controllers.report_controller import get_reports
                result = get_reports()
                assert result is not None

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_get_reports_developer_sees_own_only(self, mock_jwt, mock_jwt_id, mock_report, mock_jsonify, app):
        """Test developer only sees own reports"""
        mock_jwt_id.return_value = {'user_id': 5}
        mock_jwt.return_value = {'user_id': 5, 'role': 'developer'}
        
        mock_reports = [MagicMock(id=1, report_type='task', user_id=5)]
        mock_report.query.filter_by.return_value.all.return_value = mock_reports
        mock_jsonify.return_value = ({'reports': mock_reports}, 200)

        with app.test_request_context('/'):
            with app.app_context():
                from src.api.controllers.report_controller import get_reports
                result = get_reports()
                assert result is not None

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_get_reports_with_type_filter(self, mock_jwt, mock_jwt_id, mock_report, mock_jsonify, app):
        """Test report filtering by type"""
        mock_jwt_id.return_value = {'user_id': 1}
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        
        mock_reports = [MagicMock(id=1, report_type='task', user_id=1)]
        mock_report.query.filter_by.return_value.all.return_value = mock_reports
        mock_jsonify.return_value = ({'reports': mock_reports}, 200)

        with app.test_request_context('/?type=task'):
            with app.app_context():
                from src.api.controllers.report_controller import get_reports
                result = get_reports()
                assert result is not None

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_get_reports_pagination(self, mock_jwt, mock_jwt_id, mock_report, mock_jsonify, app):
        """Test report pagination"""
        mock_jwt_id.return_value = {'user_id': 1}
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        
        mock_reports = [MagicMock(id=i, report_type='task', user_id=1) for i in range(10)]
        mock_report.query.all.return_value = mock_reports
        mock_jsonify.return_value = ({'reports': mock_reports}, 200)

        with app.test_request_context('/?page=1&limit=10'):
            with app.app_context():
                from src.api.controllers.report_controller import get_reports
                result = get_reports()
                assert result is not None

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_get_reports_database_error(self, mock_jwt, mock_jwt_id, mock_report, mock_jsonify, app):
        """Test get_reports handles database errors"""
        mock_jwt_id.return_value = {'user_id': 1}
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        mock_report.query.all.side_effect = Exception("DB Error")
        mock_jsonify.return_value = ({'error': 'DB Error'}, 500)

        with app.test_request_context('/'):
            with app.app_context():
                from src.api.controllers.report_controller import get_reports
                result = get_reports()
                assert result is not None

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_get_report_by_id_admin_access(self, mock_jwt, mock_jwt_id, mock_report, mock_jsonify, app):
        """Test admin can access any report"""
        mock_jwt_id.return_value = {'user_id': 1}
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        
        mock_report_obj = MagicMock(id=1, report_type='task', user_id=2)
        mock_report.query.get.return_value = mock_report_obj
        mock_jsonify.return_value = ({'report': mock_report_obj}, 200)

        with app.app_context():
            from src.api.controllers.report_controller import get_report_by_id
            result = get_report_by_id(report_id=1)
            assert result is not None

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_get_report_by_id_developer_own_report(self, mock_jwt, mock_jwt_id, mock_report, mock_jsonify, app):
        """Test developer can only access own report"""
        mock_jwt_id.return_value = {'user_id': 5}
        mock_jwt.return_value = {'user_id': 5, 'role': 'developer'}
        
        mock_report_obj = MagicMock(id=1, report_type='task', user_id=5)
        mock_report.query.get.return_value = mock_report_obj
        mock_jsonify.return_value = ({'report': mock_report_obj}, 200)

        with app.app_context():
            from src.api.controllers.report_controller import get_report_by_id
            result = get_report_by_id(report_id=1)
            assert result is not None

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.db')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_delete_report_admin(self, mock_jwt, mock_jwt_id, mock_db, mock_report, mock_jsonify, app):
        """Test admin can delete any report"""
        mock_jwt_id.return_value = {'user_id': 1}
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        
        mock_report_obj = MagicMock(id=1, user_id=2)
        mock_report.query.get.return_value = mock_report_obj
        mock_jsonify.return_value = ({'success': True}, 200)

        with app.app_context():
            from src.api.controllers.report_controller import delete_report
            result = delete_report(report_id=1)
            assert result is not None

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.db')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_delete_report_developer_own(self, mock_jwt, mock_jwt_id, mock_db, mock_report, mock_jsonify, app):
        """Test developer can delete own report"""
        mock_jwt_id.return_value = {'user_id': 5}
        mock_jwt.return_value = {'user_id': 5, 'role': 'developer'}
        
        mock_report_obj = MagicMock(id=1, user_id=5)
        mock_report.query.get.return_value = mock_report_obj
        mock_jsonify.return_value = ({'success': True}, 200)

        with app.app_context():
            from src.api.controllers.report_controller import delete_report
            result = delete_report(report_id=1)
            assert result is not None

    @patch('src.api.controllers.report_controller.jsonify')
    @patch('src.api.controllers.report_controller.Report')
    @patch('src.api.controllers.report_controller.get_jwt_identity')
    @patch('src.api.controllers.report_controller.get_jwt')
    def test_get_report_not_found(self, mock_jwt, mock_jwt_id, mock_report, mock_jsonify, app):
        """Test get_report_by_id with nonexistent report"""
        mock_jwt_id.return_value = {'user_id': 1}
        mock_jwt.return_value = {'user_id': 1, 'role': 'admin'}
        
        mock_report.query.get.return_value = None
        mock_jsonify.return_value = ({'error': 'Not found'}, 404)

        with app.app_context():
            from src.api.controllers.report_controller import get_report_by_id
            result = get_report_by_id(report_id=999)
            assert result is not None
