import os
import sys
import threading
from unittest.mock import Mock, patch

import pytest
from flask import Flask, g, jsonify

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

# Import after path setup
from backend.src.api.middlewares.api_usage_logger import (
    api_usage_lock,
    api_usage_stats,
    apply_api_usage_logger,
    get_api_usage_stats,
    log_api_usage,
    reset_api_usage_stats,
)

# Create a test Flask app
app = Flask(__name__)

@pytest.fixture
def reset_usage_stats():
    """Reset API usage stats between tests"""
    with api_usage_lock:
        api_usage_stats.clear()
    yield
    with api_usage_lock:
        api_usage_stats.clear()

def test_log_api_usage_decorator(reset_usage_stats):
    """Test the log_api_usage decorator"""
    with app.test_request_context(path='/api/test', method='GET'):
        # Mock the logger
        mock_logger = Mock()

        with patch('backend.src.api.middlewares.api_usage_logger.logger', mock_logger):
            # Mock JWT identity
            with patch('backend.src.api.middlewares.api_usage_logger.get_jwt_identity',
                      return_value={'user_id': 123}):

                # Create test route with logging decorator
                @log_api_usage()
                def test_route():
                    return jsonify({"success": True})

                # Call the route
                response = test_route()

                # Check if logger was called
                assert mock_logger.info.called
                assert "API usage:" in mock_logger.info.call_args[0][0]
                assert "User: 123" in mock_logger.info.call_args[0][0]

                # Check response
                assert response.status_code == 200
                assert response.get_json() == {"success": True}

                # Check that stats were updated
                stats = get_api_usage_stats()
                # In tests, Flask's request.endpoint is None, not the app.name
                assert None in stats  # Endpoint is None in test context
                assert "GET" in stats[None]
                assert stats[None]["GET"] == 1

def test_log_api_usage_without_jwt(reset_usage_stats):
    """Test API usage logging without JWT authentication"""
    with app.test_request_context(path='/api/test', method='GET'):
        # Mock the logger
        mock_logger = Mock()

        with patch('backend.src.api.middlewares.api_usage_logger.logger', mock_logger):
            # Mock JWT identity to raise exception (no JWT)
            with patch('backend.src.api.middlewares.api_usage_logger.get_jwt_identity',
                      side_effect=Exception("No JWT")):

                # Create test route with logging decorator
                @log_api_usage()
                def test_route():
                    return jsonify({"success": True})

                # Call the route
                test_route()

                # Check if logger was called
                assert mock_logger.info.called
                assert "API usage:" in mock_logger.info.call_args[0][0]
                assert "User: None" in mock_logger.info.call_args[0][0]

                # Check that stats were updated
                stats = get_api_usage_stats()
                # In tests, Flask's request.endpoint is None, not the app.name
                assert None in stats  # Endpoint is None in test context
                assert "GET" in stats[None]
                assert stats[None]["GET"] == 1

def test_apply_api_usage_logger(reset_usage_stats):
    """Test applying the API usage logger to an app"""
    test_app = Flask(__name__)

    # Mock the logger
    mock_logger = Mock()

    with patch('backend.src.api.middlewares.api_usage_logger.logger', mock_logger):
        # Apply API usage logger to app
        apply_api_usage_logger(test_app)

        # Get the before_request and after_request handlers
        before_funcs = test_app.before_request_funcs.get(None, [])
        after_funcs = test_app.after_request_funcs.get(None, [])

        # Check that handlers were registered
        assert len(before_funcs) == 1
        assert len(after_funcs) == 1

        # Test before_request handler
        with test_app.test_request_context(method='GET', path='/api/test'):
            before_funcs[0]()  # Call the before_request handler

            # Check if start time was set
            assert hasattr(g, 'request_start_time')

            # Test after_request handler with a normal API path
            response = jsonify({"success": True})

            # Mock JWT identity
            with patch('backend.src.api.middlewares.api_usage_logger.get_jwt_identity',
                      return_value={'user_id': 123}):
                result = after_funcs[0](response)  # Call the after_request handler

            # Check if logger was called
            assert mock_logger.info.called
            assert "API usage:" in mock_logger.info.call_args[0][0]
            assert "User: 123" in mock_logger.info.call_args[0][0]

            # Check that stats were updated using None instead of "None"
            assert None in api_usage_stats  # None endpoint in test context - not a string
            assert "GET" in api_usage_stats[None]
            assert api_usage_stats[None]["GET"] == 1

            # Check that the original response was returned
            assert result == response

def test_skip_static_paths(reset_usage_stats):
    """Test that static paths are skipped in API usage logging"""
    test_app = Flask(__name__)

    # Mock the logger
    mock_logger = Mock()

    with patch('backend.src.api.middlewares.api_usage_logger.logger', mock_logger):
        # Apply API usage logger to app
        apply_api_usage_logger(test_app)

        # Get the after_request handler
        after_funcs = test_app.after_request_funcs.get(None, [])
        assert len(after_funcs) == 1

        # Test after_request handler with a static path
        with test_app.test_request_context(method='GET', path='/static/style.css'):
            response = jsonify({"success": True})
            g.request_start_time = 0  # Simulate before_request

            result = after_funcs[0](response)  # Call the after_request handler

            # Check that the original response was returned
            assert result == response

            # Check that stats were not updated for static path
            stats = get_api_usage_stats()
            assert not stats  # Should be empty for static paths

def test_get_api_usage_stats(reset_usage_stats):
    """Test getting API usage statistics"""
    # Populate some test data
    with api_usage_lock:
        api_usage_stats["test_endpoint"]["GET"] = 10
        api_usage_stats["test_endpoint"]["POST"] = 5

    # Get the stats
    stats = get_api_usage_stats()

    # Verify stats
    assert "test_endpoint" in stats
    assert "GET" in stats["test_endpoint"]
    assert "POST" in stats["test_endpoint"]
    assert stats["test_endpoint"]["GET"] == 10
    assert stats["test_endpoint"]["POST"] == 5

def test_reset_api_usage_stats(reset_usage_stats):
    """Test resetting API usage statistics"""
    # Populate some test data
    with api_usage_lock:
        api_usage_stats["test_endpoint"]["GET"] = 10
        api_usage_stats["test_endpoint"]["POST"] = 5

    # Verify data exists
    assert len(api_usage_stats) > 0

    # Reset the stats
    reset_api_usage_stats()

    # Verify stats are cleared
    stats = get_api_usage_stats()
    assert len(stats) == 0
