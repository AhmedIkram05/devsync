"""Shared, fail-open Redis access for Phase 2 features (D1 limiter, D5 presence).

One client, lazily built from REDIS_URL (unset = feature simply no-ops).
Callers wrap operations in try/except so a mid-flight outage degrades to the
in-memory/no-op path instead of 500s — the D4 "never 500" rule.
"""

import logging
import os
import time

import redis

logger = logging.getLogger(__name__)

_client = None
_failed_at = 0.0
_RETRY_AFTER_SECONDS = 30.0


def get_redis():
    """Return a Redis client, or None when REDIS_URL is unset/unreachable.

    After a successful connect the client is cached for process lifetime; a
    later outage surfaces at the operation layer (redis-py reconnects), where
    each caller's try/except takes over.
    """
    global _client, _failed_at
    url = os.getenv("REDIS_URL")
    if not url:
        return None
    if _client is not None:
        return _client
    if time.monotonic() - _failed_at < _RETRY_AFTER_SECONDS:
        return None
    try:
        candidate = redis.Redis.from_url(url, socket_timeout=0.5, socket_connect_timeout=0.5, decode_responses=True)
        candidate.ping()
        _client = candidate
        logger.info("Redis connected; shared features online (limiter, presence)")
        return _client
    except Exception:
        _failed_at = time.monotonic()
        logger.warning("Redis unreachable; shared features fail open for %ss", int(_RETRY_AFTER_SECONDS))
        return None


def reset_for_tests():
    """Drop the cached client so tests can reshape REDIS_URL behaviour."""
    global _client, _failed_at
    _client = None
    _failed_at = 0.0
