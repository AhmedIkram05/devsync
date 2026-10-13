"""Middleware for request data validation"""

import json
from functools import wraps

from flask import request

from .error_handler import error_response


def validate_json():
    """Decorator to validate that the request body contains valid JSON"""

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not request.is_json:
                return error_response("Missing JSON in request body", "bad_request", 400)

            # Try to parse JSON to ensure it's valid
            try:
                request.get_json()
            except json.JSONDecodeError:
                return error_response("Invalid JSON format in request body", "bad_request", 400)

            return f(*args, **kwargs)

        return decorated_function

    return decorator


def validate_schema(schema_class):
    """
    Decorator to validate request data against a schema

    Args:
        schema_class: A Marshmallow schema class to validate against
    """

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Ensure we have JSON data
            if not request.is_json:
                return error_response("Missing JSON in request body", "bad_request", 400)

            # Get JSON data
            data = request.get_json()

            # Validate using schema
            schema = schema_class()
            errors = schema.validate(data)

            if errors:
                return error_response("Validation error", "validation_error", 400, details={"errors": errors})

            return f(*args, **kwargs)

        return decorated_function

    return decorator


def validate_params(*required_params):
    """
    Decorator to validate required URL parameters

    Args:
        required_params: List of required parameter names
    """

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            missing_params = []

            for param in required_params:
                if param not in request.args:
                    missing_params.append(param)

            if missing_params:
                return error_response(
                    "Missing required URL parameters",
                    "bad_request",
                    400,
                    details={"missing_params": missing_params},
                )

            return f(*args, **kwargs)

        return decorated_function

    return decorator
