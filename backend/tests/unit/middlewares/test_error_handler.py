import os
import sys
from unittest.mock import Mock, patch

import pytest
from flask import Flask, jsonify

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))

# Import after path setup
from backend.src.api.middlewares.error_handler import (
    APIError,
    handle_404_error,
    handle_api_error,
    handle_generic_error,
    handle_validation_error,
    register_error_handlers,
)

# Create a test Flask app
app = Flask(__name__)


def test_api_error_class():
    """Test APIError custom exception class"""
    # Create an APIError with default values
    error = APIError("Test error message")
    assert error.message == "Test error message"
    assert error.status_code == 400
    assert error.payload is None

    # Create an APIError with custom values
    error = APIError("Custom error", 422, {"field": "value"})
    assert error.message == "Custom error"
    assert error.status_code == 422
    assert error.payload == {"field": "value"}

    # Test to_dict method
    error_dict = error.to_dict()
    assert error_dict["message"] == "Custom error"
    assert error_dict["status"] == "error"
    assert error_dict["field"] == "value"


def test_handle_api_error():
    """Test the API error handler"""
    # Create an APIError
    error = APIError("Test error message", 422)

    # Need to use app context to use jsonify
    with app.app_context():
        # Call the error handler
        response = handle_api_error(error)

        # Check response
        assert response.status_code == 422
        assert response.get_json()["message"] == "Test error message"
        assert response.get_json()["status"] == "error"


def test_handle_404_error():
    """Test the 404 error handler"""
    # Create a 404 error
    error = Mock()
    error.__str__ = lambda s: "Resource not found"

    # Need to use app context to use jsonify
    with app.app_context():
        # Call the error handler
        response, status_code = handle_404_error(error)

        # Check response
        assert status_code == 404
        assert response.get_json()["message"] == "Resource not found"
        assert response.get_json()["status"] == "error"
        assert response.get_json()["error"] == "Resource not found"


def test_handle_validation_error():
    """Test the validation error handler"""
    # Create a validation error
    error = Mock()
    error.messages = {"field1": ["Error 1"], "field2": ["Error 2"]}

    # Need to use app context to use jsonify
    with app.app_context():
        # Call the error handler
        response, status_code = handle_validation_error(error)

        # Check response
        assert status_code == 400
        assert response.get_json()["message"] == "Validation error"
        assert response.get_json()["status"] == "error"
        assert response.get_json()["errors"] == {"field1": ["Error 1"], "field2": ["Error 2"]}


def test_handle_generic_error_debug_mode():
    """Test generic error handler in debug mode"""
    # Create a generic error
    error = ValueError("Something went wrong")

    # Need to use app context and patch current_app inside it
    with app.app_context(), patch("flask.current_app.config", {"DEBUG": True}):
        # Mock the logger to avoid actual logging
        with patch("backend.src.api.middlewares.error_handler.logger") as mock_logger:
            # Call the error handler
            response, status_code = handle_generic_error(error)

        # Check that error was logged
        assert mock_logger.error.called

        # Check response
        assert status_code == 500
        assert response.get_json()["message"] == "Internal server error"
        assert response.get_json()["status"] == "error"
        assert response.get_json()["error"] == "Something went wrong"
        assert response.get_json()["traceback"] is not None  # Traceback included in debug mode


def test_handle_generic_error_production():
    """Test generic error handler in production mode"""
    # Create a generic error
    error = ValueError("Something went wrong")

    # Need to use app context and patch current_app inside it
    with app.app_context(), patch("flask.current_app.config", {"DEBUG": False}):
        # Mock the logger to avoid actual logging
        with patch("backend.src.api.middlewares.error_handler.logger") as mock_logger:
            # Call the error handler
            response, status_code = handle_generic_error(error)

        # Check that error was logged
        assert mock_logger.error.called

        # Check response
        assert status_code == 500
        assert response.get_json()["message"] == "Internal server error"
        assert response.get_json()["status"] == "error"
        assert response.get_json()["error"] == "An unexpected error occurred"
        assert response.get_json()["traceback"] is None  # No traceback in production


def test_register_error_handlers():
    """Test registering error handlers with a Flask app"""
    test_app = Flask(__name__)

    # Mock the app's register_error_handler method
    with patch.object(test_app, "register_error_handler") as mock_register:
        # Call the function to register handlers
        register_error_handlers(test_app)

        # Check that handlers were registered
        assert mock_register.call_count == 3

        # Check specific registrations
        mock_register.assert_any_call(APIError, handle_api_error)
        mock_register.assert_any_call(404, handle_404_error)
        mock_register.assert_any_call(Exception, handle_generic_error)
