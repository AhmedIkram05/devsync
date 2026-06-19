"""API middlewares package initialisation"""

from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request

from ...auth.rbac import Role  # Changed to relative import
from .api_usage_logger import apply_api_usage_logger, log_api_usage
from .error_handler import APIError, register_error_handlers
from .rate_limiter import apply_global_rate_limit, rate_limit

# Import all middleware modules - changed to relative imports
from .request_logger import apply_request_logger, log_request
from .validation_middleware import validate_json, validate_params, validate_schema


def admin_required():
    """Middleware to ensure the user has admin role"""
    def wrapper(fn):
        @wraps(fn)
        def decorator(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("role") != Role.ADMIN.value:
                return jsonify({'message': 'Admin access required'}), 403
            return fn(*args, **kwargs)
        return decorator
    return wrapper

def role_required(allowed_roles):
    """Middleware to ensure the user has one of the allowed roles"""
    values = [allowed_roles] if isinstance(allowed_roles, (Role, str)) else list(allowed_roles)

    allowed_role_values = {
        role.value if isinstance(role, Role) else role
        for role in values
    }

    def wrapper(fn):
        @wraps(fn)
        def decorator(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("role") not in allowed_role_values:
                return jsonify({'message': 'Insufficient permissions'}), 403
            return fn(*args, **kwargs)
        return decorator
    return wrapper

def setup_middlewares(app):
    """Initialise and register all middlewares with the Flask app"""
    # Register error handlers
    register_error_handlers(app)

    # Apply request logging
    apply_request_logger(app)

    # Apply API usage tracking
    apply_api_usage_logger(app)

    # Apply global rate limiting
    apply_global_rate_limit(app, requests_per_window=300, window_seconds=60)
