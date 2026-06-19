"""Middleware to implement rate limiting for API requests"""

import threading
import time
from collections import defaultdict
from functools import wraps

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity

# In-memory storage for rate limiting (for a real app, use Redis)
request_counts = defaultdict(lambda: defaultdict(int))
request_timestamps = defaultdict(lambda: defaultdict(list))
rate_limit_lock = threading.Lock()

def get_client_identifier():
    """Get a unique identifier for the client making the request"""
    # Try to get user ID from JWT token first
    user_id = None
    try:
        identity = get_jwt_identity()
        if identity and 'user_id' in identity:
            user_id = identity['user_id']
    except Exception:
        pass

    # Fall back to IP address if not authenticated
    if not user_id:
        user_id = f"ip:{request.remote_addr}"

    return user_id

def clean_old_requests(client_id, endpoint, window_seconds):
    """Remove requests older than the rate limit window"""
    current_time = time.time()
    with rate_limit_lock:
        request_timestamps[client_id][endpoint] = [
            ts for ts in request_timestamps[client_id][endpoint]
            if current_time - ts < window_seconds
        ]
        request_counts[client_id][endpoint] = len(request_timestamps[client_id][endpoint])

def rate_limit(requests_per_window=100, window_seconds=60, by_endpoint=True):
    """
    Decorator to apply rate limiting to an endpoint

    Args:
        requests_per_window: Maximum number of requests allowed in the time window
        window_seconds: Time window in seconds
        by_endpoint: Whether to limit by specific endpoint or globally for the client
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            client_id = get_client_identifier()
            endpoint = request.endpoint if by_endpoint else 'global'

            # Clean old requests outside the window
            clean_old_requests(client_id, endpoint, window_seconds)

            # Check if rate limit exceeded
            with rate_limit_lock:
                if request_counts[client_id][endpoint] >= requests_per_window:
                    return jsonify({
                        'status': 'error',
                        'message': 'Rate limit exceeded. Please try again later.'
                    }), 429

                # Add current request timestamp
                current_time = time.time()
                request_timestamps[client_id][endpoint].append(current_time)
                request_counts[client_id][endpoint] += 1

            # Execute the request handler
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def apply_global_rate_limit(app, requests_per_window=300, window_seconds=60):
    """Apply a global rate limit to all routes"""
    @app.before_request
    def check_rate_limit():
        # Skip rate limiting for certain paths
        if request.path.startswith('/static') or request.path == '/favicon.ico':
            return None

        client_id = get_client_identifier()
        endpoint = 'global'

        # Clean old requests outside the window
        clean_old_requests(client_id, endpoint, window_seconds)

        # Check if rate limit exceeded
        with rate_limit_lock:
            if request_counts[client_id][endpoint] >= requests_per_window:
                return jsonify({
                    'status': 'error',
                    'message': 'Global rate limit exceeded. Please try again later.'
                }), 429

            # Add current request timestamp
            current_time = time.time()
            request_timestamps[client_id][endpoint].append(current_time)
            request_counts[client_id][endpoint] += 1
