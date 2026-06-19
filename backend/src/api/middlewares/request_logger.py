"""Middleware to log incoming API requests"""

import logging
import time
from functools import wraps

from flask import g, request

# Configure logger
logger = logging.getLogger("api.requests")


def log_request():
    """Decorator to log request information"""

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Set start time
            start_time = time.time()

            # Store request data for logging
            g.request_start_time = start_time
            g.request_path = request.path
            g.request_method = request.method
            g.request_ip = request.remote_addr

            # Log initial request information
            logger.info(f"Request started: {request.method} {request.path} from {request.remote_addr}")

            # Execute the request handler
            response = f(*args, **kwargs)

            # Calculate request processing time
            duration = time.time() - start_time

            # Log request completion information
            status_code = response.status_code if hasattr(response, "status_code") else 200
            logger.info(
                f"Request completed: {request.method} {request.path} - "
                f"Status: {status_code} - Duration: {duration:.4f}s"
            )

            return response

        return decorated_function

    return decorator


def apply_request_logger(app):
    """Apply request logging middleware to all routes"""

    @app.before_request
    def before_request():
        g.request_start_time = time.time()
        logger.info(f"Request started: {request.method} {request.path} from {request.remote_addr}")

    @app.after_request
    def after_request(response):
        duration = time.time() - g.get("request_start_time", time.time())
        logger.info(
            f"Request completed: {request.method} {request.path} - "
            f"Status: {response.status_code} - Duration: {duration:.4f}s"
        )
        return response
