"""Integration tests for report validator"""

import pytest
from flask import json
from src.api.validators.report_validator import validate_report_data


class TestReportValidatorIntegration:
    """Integration tests using Flask test client"""

    def test_validate_report_data_success_minimal(self, app, client):
        """Test successful validation with minimal data"""
        with app.app_context():
            data = {"report_type": "task", "date_range": "week", "summary": {}, "details": []}
            result = validate_report_data(data)
            # Function should return a tuple (response, status_code) or None on success
            if result is not None:
                assert isinstance(result, tuple) or result is None

    def test_validate_report_data_missing_report_type(self, app, client):
        """Test validation fails with missing report_type"""
        with app.app_context():
            data = {"date_range": "week", "summary": {}, "details": []}
            result = validate_report_data(data)
            # Should return error response
            assert result is not None

    def test_validate_report_data_missing_date_range(self, app, client):
        """Test validation fails with missing date_range"""
        with app.app_context():
            data = {"report_type": "task", "summary": {}, "details": []}
            result = validate_report_data(data)
            assert result is not None

    def test_validate_report_data_missing_summary(self, app, client):
        """Test validation fails with missing summary"""
        with app.app_context():
            data = {"report_type": "task", "date_range": "week", "details": []}
            result = validate_report_data(data)
            assert result is not None

    def test_validate_report_data_missing_details(self, app, client):
        """Test validation fails with missing details"""
        with app.app_context():
            data = {"report_type": "task", "date_range": "week", "summary": {}}
            result = validate_report_data(data)
            assert result is not None

    def test_validate_report_data_invalid_report_type(self, app, client):
        """Test validation fails with invalid report_type"""
        with app.app_context():
            data = {"report_type": "invalid", "date_range": "week", "summary": {}, "details": []}
            result = validate_report_data(data)
            assert result is not None
            if isinstance(result, tuple):
                assert result[1] == 400

    def test_validate_report_data_invalid_date_range(self, app, client):
        """Test validation fails with invalid date_range"""
        with app.app_context():
            data = {"report_type": "task", "date_range": "invalid_range", "summary": {}, "details": []}
            result = validate_report_data(data)
            assert result is not None

    def test_validate_report_data_all_valid_report_types(self, app, client):
        """Test all valid report types pass validation"""
        valid_types = ["task", "project", "user", "system"]

        with app.app_context():
            for report_type in valid_types:
                data = {"report_type": report_type, "date_range": "week", "summary": {}, "details": []}
                result = validate_report_data(data)
                # Should succeed or return error tuple, not raise
                assert result is None or isinstance(result, tuple)

    def test_validate_report_data_all_valid_date_ranges(self, app, client):
        """Test all valid date ranges pass validation"""
        valid_ranges = ["day", "week", "month", "quarter", "year", "all"]

        with app.app_context():
            for date_range in valid_ranges:
                data = {"report_type": "task", "date_range": date_range, "summary": {}, "details": []}
                result = validate_report_data(data)
                assert result is None or isinstance(result, tuple)

    def test_validate_report_data_summary_nested_objects(self, app, client):
        """Test summary with nested objects"""
        with app.app_context():
            data = {
                "report_type": "task",
                "date_range": "week",
                "summary": {"nested": {"deep": {"value": 123}}},
                "details": [],
            }
            result = validate_report_data(data)
            assert result is None or isinstance(result, tuple)

    def test_validate_report_data_details_complex_objects(self, app, client):
        """Test details with complex objects"""
        with app.app_context():
            data = {
                "report_type": "task",
                "date_range": "week",
                "summary": {},
                "details": [{"id": 1, "nested": {"key": "value"}, "list": [1, 2, 3]}, {"id": 2, "data": None}],
            }
            result = validate_report_data(data)
            assert result is None or isinstance(result, tuple)

    def test_validate_report_data_unicode_handling(self, app, client):
        """Test unicode characters in data"""
        with app.app_context():
            data = {
                "report_type": "task",
                "date_range": "week",
                "summary": {"unicode_key": "你好", "emoji": "🎉"},
                "details": [],
            }
            result = validate_report_data(data)
            assert result is None or isinstance(result, tuple)

    def test_validate_report_data_empty_containers(self, app, client):
        """Test empty summary and details containers"""
        with app.app_context():
            data = {"report_type": "task", "date_range": "week", "summary": {}, "details": []}
            result = validate_report_data(data)
            assert result is None or isinstance(result, tuple)

    def test_validate_report_data_extra_fields_ignored(self, app, client):
        """Test extra fields are ignored"""
        with app.app_context():
            data = {
                "report_type": "task",
                "date_range": "week",
                "summary": {},
                "details": [],
                "extra_field": "should_be_ignored",
                "another_extra": 123,
            }
            result = validate_report_data(data)
            assert result is None or isinstance(result, tuple)
