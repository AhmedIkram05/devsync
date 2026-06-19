"""Middleware for request data validation"""

import json
from functools import wraps

from flask import jsonify, request


def validate_json():
    """Decorator to validate that the request body contains valid JSON"""

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not request.is_json:
                return jsonify({"status": "error", "message": "Missing JSON in request body"}), 400

            # Try to parse JSON to ensure it's valid
            try:
                request.get_json()
            except json.JSONDecodeError:
                return jsonify({"status": "error", "message": "Invalid JSON format in request body"}), 400

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
                return jsonify({"status": "error", "message": "Missing JSON in request body"}), 400

            # Get JSON data
            data = request.get_json()

            # Validate using schema
            schema = schema_class()
            errors = schema.validate(data)

            if errors:
                return jsonify({"status": "error", "message": "Validation error", "errors": errors}), 400

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
                return jsonify(
                    {"status": "error", "message": "Missing required URL parameters", "missing_params": missing_params}
                ), 400

            return f(*args, **kwargs)

        return decorated_function

    return decorator
