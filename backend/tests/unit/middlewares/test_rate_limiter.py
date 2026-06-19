import os
import sys
import time
from unittest.mock import Mock, patch

import pytest
from flask import Flask, jsonify, request

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

# Import after path setup
from backend.src.api.middlewares.rate_limiter import (
    apply_global_rate_limit,
    clean_old_requests,
    get_client_identifier,
    rate_limit,
    request_counts,
    request_timestamps,
)

# Create a test Flask app
app = Flask(__name__)

@pytest.fixture
def reset_rate_limit_data():
    """Reset rate limit data between tests"""
    request_counts.clear()
    request_timestamps.clear()
    yield
    request_counts.clear()
    request_timestamps.clear()

def test_get_client_identifier_with_jwt():
    """Test getting client identifier with JWT"""
    with app.test_request_context():
        # Mock JWT identity
        with patch('backend.src.api.middlewares.rate_limiter.get_jwt_identity',
                  return_value={'user_id': 123}):
            client_id = get_client_identifier()
            assert client_id == 123

def test_get_client_identifier_without_jwt():
    """Test getting client identifier without JWT"""
    with app.test_request_context():
        # Mock JWT identity raising an exception
        with patch('backend.src.api.middlewares.rate_limiter.get_jwt_identity',
                  side_effect=Exception("No JWT")):
            client_id = get_client_identifier()
            assert client_id == f"ip:{request.remote_addr}"

def test_clean_old_requests(reset_rate_limit_data):
    """Test cleaning old request timestamps"""
    # Set up test data
    client_id = "test_client"
    endpoint = "test_endpoint"

    # Add timestamps - some old, some new
    current_time = time.time()
    request_timestamps[client_id][endpoint] = [
        current_time - 100,  # Old (should be removed)
        current_time - 30,   # Recent (should be kept)
        current_time - 10    # Recent (should be kept)
    ]
    request_counts[client_id][endpoint] = 3

    # Run the cleanup with a 60-second window
    clean_old_requests(client_id, endpoint, 60)

    # Check that old requests were removed
    assert len(request_timestamps[client_id][endpoint]) == 2
    assert request_counts[client_id][endpoint] == 2

    # All remaining timestamps should be within the window
    for ts in request_timestamps[client_id][endpoint]:
        assert current_time - ts < 60

def test_rate_limit_decorator_under_limit(reset_rate_limit_data):
    """Test rate limit decorator when under the limit"""
    with app.test_request_context():
        # Mock client identifier
        with patch('backend.src.api.middlewares.rate_limiter.get_client_identifier',
                  return_value="test_client"):

            # Create test route with rate limiting
            @rate_limit(requests_per_window=5, window_seconds=60)
            def test_route():
                return jsonify({"success": True})

            # Call the route multiple times (below the limit)
            for _ in range(3):
                response = test_route()
                assert response.status_code == 200
                assert response.get_json() == {"success": True}

def test_rate_limit_decorator_exceeding_limit(reset_rate_limit_data):
    """Test rate limit decorator when exceeding the limit"""
    with app.test_request_context():
        # Mock client identifier
        with patch('backend.src.api.middlewares.rate_limiter.get_client_identifier',
                  return_value="test_client"):

            # Create test route with rate limiting
            @rate_limit(requests_per_window=3, window_seconds=60)
            def test_route():
                return jsonify({"success": True})

            # Call the route multiple times (to exceed the limit)
            for i in range(5):
                response = test_route()
                if i < 3:
                    assert response.status_code == 200
                    assert response.get_json() == {"success": True}
                else:
                    # Handle response that might be a tuple (response, status_code)
                    if isinstance(response, tuple):
                        resp, status = response
                        assert status == 429
                        assert "Rate limit exceeded" in resp.get_json()["message"]
                    else:
                        assert response.status_code == 429
                        assert "Rate limit exceeded" in response.get_json()["message"]

def test_global_rate_limit(reset_rate_limit_data):
    """Test the global rate limiter"""
    test_app = Flask(__name__)

    # Apply global rate limit to the app
    apply_global_rate_limit(test_app, requests_per_window=2, window_seconds=60)

    # Get the before_request handler
    before_funcs = test_app.before_request_funcs.get(None, [])
    assert len(before_funcs) == 1

    # Test static path exclusion
    with test_app.test_request_context(path='/static/css/style.css'):
        result = before_funcs[0]()
        assert result is None  # Static paths should be excluded

    # Test rate limiting for a regular path
    with patch('backend.src.api.middlewares.rate_limiter.get_client_identifier',
              return_value="test_client"):

        # First request should be allowed
        with test_app.test_request_context(path='/api/test'):
            result = before_funcs[0]()
            assert result is None  # No response = allowed

        # Second request should be allowed
        with test_app.test_request_context(path='/api/test'):
            result = before_funcs[0]()
            assert result is None  # No response = allowed

        # Third request should be rate limited
        with test_app.test_request_context(path='/api/test'):
            result = before_funcs[0]()
            assert result is not None

            # Handle result that might be a tuple (response, status_code)
            if isinstance(result, tuple):
                resp, status = result
                assert status == 429
                assert "Global rate limit exceeded" in resp.get_json()["message"]
            else:
                assert result.status_code == 429
                assert "Global rate limit exceeded" in result.get_json()["message"]
