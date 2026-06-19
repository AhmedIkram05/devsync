from unittest.mock import patch

import pytest


def test_validate_notification_data_valid():
    # Updated patch target:
    with patch('src.api.validators.notification_validator.jsonify'):
        from src.api.validators.notification_validator import validate_notification_data

        # Valid data with required fields
        data = {
            'content': 'Test notification',
            'user_id': 1
        }
        result = validate_notification_data(data)
        assert result is None  # No errors returned means validation passed

def test_validate_notification_data_missing_fields():
    # Updated patch target:
    with patch('src.api.validators.notification_validator.jsonify') as mock_jsonify:
        mock_jsonify.return_value = "Error message"
        from src.api.validators.notification_validator import validate_notification_data

        # Missing content
        data = {'user_id': 1}
        result = validate_notification_data(data)
        assert result == ("Error message", 400)

        # Missing user_id
        data = {'content': 'Test notification'}
        result = validate_notification_data(data)
        assert result == ("Error message", 400)

def test_validate_notification_data_invalid_content_length():
    # Updated patch target:
    with patch('src.api.validators.notification_validator.jsonify') as mock_jsonify:
        mock_jsonify.return_value = "Error message"
        from src.api.validators.notification_validator import validate_notification_data

        # Content too short
        data = {'content': '', 'user_id': 1}
        result = validate_notification_data(data)
        assert result == ("Error message", 400)

        # Content too long
        data = {'content': 'x' * 501, 'user_id': 1}
        result = validate_notification_data(data)
        assert result == ("Error message", 400)

def test_validate_notification_data_invalid_user_id():
    # Updated patch target:
    with patch('src.api.validators.notification_validator.jsonify') as mock_jsonify:
        mock_jsonify.return_value = "Error message"
        from src.api.validators.notification_validator import validate_notification_data

        # Non-integer user_id
        data = {'content': 'Test notification', 'user_id': 'abc'}
        result = validate_notification_data(data)
        assert result == ("Error message", 400)

def test_validate_notification_data_optional_fields():
    # Updated patch target:
    with patch('src.api.validators.notification_validator.jsonify') as mock_jsonify:
        mock_jsonify.return_value = "Error message"
        from src.api.validators.notification_validator import validate_notification_data

        # Valid task_id (integer)
        data = {'content': 'Test notification', 'user_id': 1, 'task_id': 2}
        result = validate_notification_data(data)
        assert result is None

        # Invalid task_id (string)
        data = {'content': 'Test notification', 'user_id': 1, 'task_id': 'abc'}
        result = validate_notification_data(data)
        assert result == ("Error message", 400)

        # Valid is_read (boolean)
        data = {'content': 'Test notification', 'user_id': 1, 'is_read': True}
        result = validate_notification_data(data)
        assert result is None

        # Invalid is_read (non-boolean)
        data = {'content': 'Test notification', 'user_id': 1, 'is_read': 'yes'}
        result = validate_notification_data(data)
        assert result == ("Error message", 400)
