import os
import sys
from unittest.mock import Mock, call, patch

import pytest
from flask import Flask, g, jsonify

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))

# Import after path setup
from backend.src.api.middlewares.request_logger import (
    REQUEST_ID_HEADER,
    apply_request_logger,
    get_request_id,
    log_request,
)

# Create a test Flask app
app = Flask(__name__)


def test_log_request_decorator():
    """Test the log_request decorator"""
    with app.test_request_context(method="GET", path="/test"):
        # Mock the logger
        mock_logger = Mock()

        with patch("backend.src.api.middlewares.request_logger.logger", mock_logger):
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

    with patch("backend.src.api.middlewares.request_logger.logger", mock_logger):
        # Apply request logger to app
        apply_request_logger(test_app)

        # Get the before_request and after_request handlers
        before_funcs = test_app.before_request_funcs.get(None, [])
        after_funcs = test_app.after_request_funcs.get(None, [])

        # Check that handlers were registered
        assert len(before_funcs) == 1
        assert len(after_funcs) == 1

        # Test before_request handler
        with test_app.test_request_context(method="GET", path="/test"):
            before_funcs[0]()  # Call the before_request handler

            # Check if start time was set
            assert hasattr(g, "request_start_time")

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


def test_request_id_generated_and_echoed():
    """Every request gets an ID; the response echoes it for client-side correlation."""
    test_app = Flask(__name__)
    apply_request_logger(test_app)
    before_funcs = test_app.before_request_funcs.get(None, [])
    after_funcs = test_app.after_request_funcs.get(None, [])

    with test_app.test_request_context(method="GET", path="/test"):
        before_funcs[0]()
        assert hasattr(g, "request_id")
        assert len(g.request_id) == 16

        response = jsonify({"success": True})
        result = after_funcs[0](response)

        assert result.headers[REQUEST_ID_HEADER] == g.request_id


def test_request_id_propagated_from_upstream():
    """LB/CDN-provided IDs pass through untouched (distributed trace continuity)."""
    test_app = Flask(__name__)
    apply_request_logger(test_app)
    before_funcs = test_app.before_request_funcs.get(None, [])
    after_funcs = test_app.after_request_funcs.get(None, [])

    with test_app.test_request_context(method="GET", path="/test", headers={REQUEST_ID_HEADER: "lb-provided-123"}):
        before_funcs[0]()
        assert g.request_id == "lb-provided-123"

        response = jsonify({"success": True})
        result = after_funcs[0](response)
        assert result.headers[REQUEST_ID_HEADER] == "lb-provided-123"


def test_get_request_id_defaults_outside_request():
    """Background/boot log lines carry '-' instead of raising."""
    assert get_request_id() == "-"


def test_json_logs_carry_request_id():
    """The GMP JSON formatter includes the active request ID per record."""
    import logging

    from backend.src.logging_config import JsonFormatter, RequestIdFilter

    test_app = Flask(__name__)
    formatter = JsonFormatter()
    filt = RequestIdFilter()

    with test_app.test_request_context(method="GET", path="/test"):
        g.request_id = "abc123"
        record = logging.LogRecord("test", logging.INFO, __file__, 1, "hello", None, None)
        assert filt.filter(record) is True
        assert '"request_id": "abc123"' in formatter.format(record)

    outside = logging.LogRecord("test", logging.INFO, __file__, 1, "boot line", None, None)
    assert filt.filter(outside) is True
    assert '"request_id": "-"' in formatter.format(outside)
