"""API middlewares package initialisation"""

from functools import wraps
from flask import jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request
from ...auth.rbac import Role  # Changed to relative import

# Import all middleware modules - changed to relative imports
from .request_logger import log_request, apply_request_logger
from .error_handler import APIError, register_error_handlers
from .api_usage_logger import log_api_usage, apply_api_usage_logger
from .rate_limiter import rate_limit, apply_global_rate_limit
from .validation_middleware import validate_json, validate_schema, validate_params

def admin_required():
    """Middleware to ensure the user has admin role"""
    def wrapper(fn):
        @wraps(fn)
        def decorator(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims["role"] != Role.ADMIN.value:
                return jsonify({'message': 'Admin access required'}), 403
            return fn(*args, **kwargs)
        return decorator
    return wrapper

def role_required(allowed_roles):
    """Middleware to ensure the user has one of the allowed roles"""
    def _normalize_allowed_roles(value):
        if isinstance(value, (Role, str)):
            values = [value]
        else:
            values = list(value)

        normalized = set()
        for role in values:
            role_value = role.value if isinstance(role, Role) else role
            normalized.add(role_value)

            # Keep route checks backward compatible with both legacy and new role names.
            if role_value in (Role.CLIENT.value, Role.DEVELOPER.value, Role.TEAM_LEAD.value):
                normalized.update({Role.CLIENT.value, Role.DEVELOPER.value, Role.TEAM_LEAD.value})

        return normalized

    normalized_allowed_roles = _normalize_allowed_roles(allowed_roles)

    def wrapper(fn):
        @wraps(fn)
        def decorator(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("role") not in normalized_allowed_roles:
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
