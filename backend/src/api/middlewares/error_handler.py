"""Middleware to handle errors consistently across the API"""

import contextlib
import logging
import traceback

from flask import jsonify

from .request_logger import get_request_id

# Configure logger
logger = logging.getLogger("api.errors")


class APIError(Exception):
    """Custom API exception class"""

    def __init__(self, message, status_code=400, payload=None, code="api_error"):
        super().__init__(self)
        self.message = message
        self.status_code = status_code
        self.payload = payload
        self.code = code

    def to_dict(self):
        rv = dict(self.payload or ())
        rv["message"] = self.message
        rv["status"] = "error"
        rv.setdefault("code", self.code)
        rv.setdefault("request_id", get_request_id())
        return rv


def build_error_envelope(message, code, request_id=None, details=None):
    envelope = {
        "status": "error",
        "message": message,
        "code": code,
        "request_id": request_id or get_request_id(),
    }
    if details:
        envelope.update(details)
    return envelope


def error_response(message, code, http_status=400, details=None, headers=None, request_id=None):
    body = build_error_envelope(message, code, request_id=request_id, details=details)
    response = jsonify(body)
    with contextlib.suppress(Exception):
        response.status_code = http_status
    if headers:
        with contextlib.suppress(Exception):
            for key, value in headers.items():
                response.headers[key] = value
    return response, http_status


def handle_api_error(error):
    """Handler for custom API errors"""
    code = getattr(error, "code", "api_error")
    payload = getattr(error, "payload", None)
    return error_response(error.message, code, getattr(error, "status_code", 400), details=dict(payload or ()))


def handle_404_error(error):
    """Handler for 404 not found errors"""
    return error_response("Resource not found", "not_found", 404, details={"error": str(error)})


def handle_validation_error(error):
    """Handler for validation errors"""
    return error_response("Validation error", "validation_error", 400, details={"errors": error.messages})


def handle_generic_error(error):
    """Handler for all other unhandled exceptions"""
    # Log the full traceback for debugging
    logger.error(f"Unhandled exception: {str(error)}\n{traceback.format_exc()}")

    try:
        from flask import current_app

        debug = current_app.config.get("DEBUG", False)
    except RuntimeError:
        debug = False

    # In production, don't expose detailed error information
    if debug:
        error_details = str(error)
        traceback_info = traceback.format_exc()
    else:
        error_details = "An unexpected error occurred"
        traceback_info = None

    return error_response(
        "Internal server error",
        "internal_error",
        500,
        details={"error": error_details, "traceback": traceback_info if traceback_info else None},
    )


def register_error_handlers(app):
    """Register all error handlers with the Flask app"""
    app.register_error_handler(APIError, handle_api_error)
    app.register_error_handler(404, handle_404_error)
    app.register_error_handler(Exception, handle_generic_error)

    # Register additional error handlers as needed
    # app.register_error_handler(ValidationError, handle_validation_error)
