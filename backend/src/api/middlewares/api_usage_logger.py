"""Middleware to track API endpoint usage statistics"""

import contextlib
import logging
import threading
import time
from collections import defaultdict
from functools import wraps

from flask import g, request
from flask_jwt_extended import get_jwt_identity

# Configure logger
logger = logging.getLogger('api.usage')

# In-memory storage for API usage stats (for a real app, use Redis/DB)
api_usage_stats = defaultdict(lambda: defaultdict(int))
api_usage_lock = threading.Lock()

def log_api_usage():
    """Decorator to track API usage statistics"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            endpoint = request.endpoint
            method = request.method
            start_time = time.time()

            # Execute the request handler
            response = f(*args, **kwargs)

            # Record usage statistics
            duration = time.time() - start_time
            status_code = response.status_code if hasattr(response, 'status_code') else 200

            # Get user ID if authenticated
            user_id = None
            with contextlib.suppress(BaseException):
                user_id = get_jwt_identity()['user_id'] if get_jwt_identity() else None

            # Update usage statistics
            with api_usage_lock:
                api_usage_stats[endpoint][method] += 1

            # Log usage information
            logger.info(
                f"API usage: {endpoint} [{method}] - "
                f"Status: {status_code} - Duration: {duration:.4f}s - "
                f"User: {user_id}"
            )

            return response
        return decorated_function
    return decorator

def apply_api_usage_logger(app):
    """Apply API usage logging middleware to all routes"""
    @app.before_request
    def before_request():
        g.request_start_time = time.time()

    @app.after_request
    def after_request(response):
        # Skip logging for certain paths
        if request.path.startswith('/static') or request.path == '/favicon.ico':
            return response

        duration = time.time() - g.get('request_start_time', time.time())
        endpoint = request.endpoint
        method = request.method
        status_code = response.status_code

        # Get user ID if authenticated
        user_id = None
        with contextlib.suppress(BaseException):
            user_id = get_jwt_identity()['user_id'] if get_jwt_identity() else None

        # Update usage statistics
        with api_usage_lock:
            api_usage_stats[endpoint][method] += 1

        # Log usage information
        logger.info(
            f"API usage: {endpoint} [{method}] - "
            f"Path: {request.path} - Status: {status_code} - "
            f"Duration: {duration:.4f}s - User: {user_id}"
        )

        return response

def get_api_usage_stats():
    """Get current API usage statistics"""
    with api_usage_lock:
        return dict(api_usage_stats)

def reset_api_usage_stats():
    """Reset API usage statistics"""
    global api_usage_stats
    with api_usage_lock:
        api_usage_stats = defaultdict(lambda: defaultdict(int))
