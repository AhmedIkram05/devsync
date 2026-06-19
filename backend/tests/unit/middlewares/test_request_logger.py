import os
import sys
from unittest.mock import Mock, call, patch

import pytest
from flask import Flask, g, jsonify

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

# Import after path setup
from backend.src.api.middlewares.request_logger import apply_request_logger, log_request

# Create a test Flask app
app = Flask(__name__)

def test_log_request_decorator():
    """Test the log_request decorator"""
    with app.test_request_context(method='GET', path='/test'):
        # Mock the logger
        mock_logger = Mock()

        with patch('backend.src.api.middlewares.request_logger.logger', mock_logger):
            # Create test route with logging decorator
            @log_request()
            def test_route():
                return jsonify({"success": True})

            # Call the route
            response = test_route()

            # Check if logger was called
            assert mock_logger.info.call_count == 2  # Start and completion logs

            # Check if the first log was for request start
            assert "Request started:" in mock_logger.info.call_args_list[0][0][0]

            # Check if the second log was for request completion
            assert "Request completed:" in mock_logger.info.call_args_list[1][0][0]
            assert "Status: 200" in mock_logger.info.call_args_list[1][0][0]

            # Check response
            assert response.status_code == 200
            assert response.get_json() == {"success": True}

def test_apply_request_logger():
    """Test applying the request logger to an app"""
    test_app = Flask(__name__)

    # Mock the logger
    mock_logger = Mock()

    with patch('backend.src.api.middlewares.request_logger.logger', mock_logger):
        # Apply request logger to app
        apply_request_logger(test_app)

        # Get the before_request and after_request handlers
        before_funcs = test_app.before_request_funcs.get(None, [])
        after_funcs = test_app.after_request_funcs.get(None, [])

        # Check that handlers were registered
        assert len(before_funcs) == 1
        assert len(after_funcs) == 1

        # Test before_request handler
        with test_app.test_request_context(method='GET', path='/test'):
            before_funcs[0]()  # Call the before_request handler

            # Check if start time was set
            assert hasattr(g, 'request_start_time')

            # Check if logger was called
            assert mock_logger.info.call_count == 1
            assert "Request started:" in mock_logger.info.call_args[0][0]

            # Test after_request handler
            response = jsonify({"success": True})
            result = after_funcs[0](response)  # Call the after_request handler

            # Check if logger was called again
            assert mock_logger.info.call_count == 2
            assert "Request completed:" in mock_logger.info.call_args[0][0]
            assert "Status: 200" in mock_logger.info.call_args[0][0]

            # Check that the original response was returned
            assert result == response
