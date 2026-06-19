"""Middleware to handle errors consistently across the API"""

import logging
import traceback

from flask import current_app, jsonify

# Configure logger
logger = logging.getLogger('api.errors')

class APIError(Exception):
    """Custom API exception class"""
    def __init__(self, message, status_code=400, payload=None):
        super().__init__(self)
        self.message = message
        self.status_code = status_code
        self.payload = payload

    def to_dict(self):
        rv = dict(self.payload or ())
        rv['message'] = self.message
        rv['status'] = 'error'
        return rv

def handle_api_error(error):
    """Handler for custom API errors"""
    response = jsonify(error.to_dict())
    response.status_code = error.status_code
    return response

def handle_404_error(error):
    """Handler for 404 not found errors"""
    return jsonify({
        'status': 'error',
        'message': 'Resource not found',
        'error': str(error)
    }), 404

def handle_validation_error(error):
    """Handler for validation errors"""
    return jsonify({
        'status': 'error',
        'message': 'Validation error',
        'errors': error.messages
    }), 400

def handle_generic_error(error):
    """Handler for all other unhandled exceptions"""
    # Log the full traceback for debugging
    logger.error(f"Unhandled exception: {str(error)}\n{traceback.format_exc()}")

    # In production, don't expose detailed error information
    if current_app.config.get('DEBUG', False):
        error_details = str(error)
        traceback_info = traceback.format_exc()
    else:
        error_details = "An unexpected error occurred"
        traceback_info = None

    return jsonify({
        'status': 'error',
        'message': 'Internal server error',
        'error': error_details,
        'traceback': traceback_info if traceback_info else None
    }), 500

def register_error_handlers(app):
    """Register all error handlers with the Flask app"""
    app.register_error_handler(APIError, handle_api_error)
    app.register_error_handler(404, handle_404_error)
    app.register_error_handler(Exception, handle_generic_error)

    # Register additional error handlers as needed
    # app.register_error_handler(ValidationError, handle_validation_error)
