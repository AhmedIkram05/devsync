"""Middleware to implement rate limiting for API requests

D1: the bucket of record is Redis (INCR/EXPIRE per client + endpoint, one
shared bucket across all backend pods). When REDIS_URL is unset or Redis is
unreachable the in-memory dict path below takes over verbatim (fail-open
per-pod behaviour, same messages and defaults).
"""

import threading
import time
from collections import defaultdict
from functools import wraps

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity

from ...services.redis_client import get_redis

# In-memory storage for rate limiting (per-pod fallback when Redis is unset/down)
request_counts = defaultdict(lambda: defaultdict(int))
request_timestamps = defaultdict(lambda: defaultdict(list))
rate_limit_lock = threading.Lock()


def get_client_identifier():
    """Get a unique identifier for the client making the request"""
    # Try to get user ID from JWT token first
    user_id = None
    try:
        identity = get_jwt_identity()
        if identity and "user_id" in identity:
            user_id = identity["user_id"]
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
            ts for ts in request_timestamps[client_id][endpoint] if current_time - ts < window_seconds
        ]
        request_counts[client_id][endpoint] = len(request_timestamps[client_id][endpoint])


def _window_bucket(client_id, endpoint, window_seconds):
    """Epoch-aligned fixed window: one Redis key per (client, endpoint, window)."""
    epoch = int(time.time() // max(int(window_seconds), 1))
    return f"rl:{client_id}:{endpoint}:{epoch}"


def _redis_hit(client_id, endpoint, requests_per_window, window_seconds):
    """Count a hit against the shared Redis bucket.

    Returns True/False for a verdict, or None when Redis is unset/failing so
    the caller falls back to the in-memory path (never raises, never 500).
    """
    if requests_per_window <= 0:
        return False
    client = get_redis()
    if not client:
        return None
    bucket = _window_bucket(client_id, endpoint, window_seconds)
    try:
        # INCR + EXPIRE on first hit (D1 contract); the expires-at first-hit
        # shape keeps the window pinned to the bucket epoch.
        count = client.incr(bucket)
        if count == 1:
            client.expire(bucket, window_seconds)
        return count > requests_per_window
    except Exception:
        return None


def _record_hit(client_id, endpoint, requests_per_window, window_seconds):
    """Count one request; True = limit exceeded.

    Redis first (shared across pods); unset/dead Redis falls back to the
    per-pod in-memory sliding window with identical limits and boundaries.
    """
    verdict = _redis_hit(client_id, endpoint, requests_per_window, window_seconds)
    if verdict is not None:
        return verdict

    # In-memory fallback (remove Redis entirely and this path is the app).
    clean_old_requests(client_id, endpoint, window_seconds)
    with rate_limit_lock:
        if request_counts[client_id][endpoint] >= requests_per_window:
            return True
        # Add current request timestamp
        request_timestamps[client_id][endpoint].append(time.time())
        request_counts[client_id][endpoint] += 1
    return False


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
            endpoint = request.endpoint if by_endpoint else "global"

            if _record_hit(client_id, endpoint, requests_per_window, window_seconds):
                return jsonify({"status": "error", "message": "Rate limit exceeded. Please try again later."}), 429

            # Execute the request handler
            return f(*args, **kwargs)

        return decorated_function

    return decorator


def apply_global_rate_limit(app, requests_per_window=300, window_seconds=60):
    """Apply a per-client, per-endpoint rate limit to all routes.

    One shared "global" bucket per client meant a single page load (many API
    calls at once) could 429 itself. Bucketing by endpoint keeps a chatty
    page from starving other calls, while the per-endpoint decorator stays
    for strict routes (e.g. login).
    """

    @app.before_request
    def check_rate_limit():
        # Skip rate limiting for certain paths
        if request.path.startswith("/static") or request.path == "/favicon.ico" or request.path == "/health":
            return None

        client_id = get_client_identifier()
        endpoint = request.endpoint or request.path

        if _record_hit(client_id, endpoint, requests_per_window, window_seconds):
            return jsonify({"status": "error", "message": "Global rate limit exceeded. Please try again later."}), 429
