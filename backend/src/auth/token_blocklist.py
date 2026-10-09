"""JWT denylist (blocklist) with Redis + in-memory fallback.

Policy (fail-open vs fail-closed):
- General routes: fail-OPEN for availability. If the Redis backend errors,
  ``is_token_revoked`` logs a warning, bumps an in-process error counter
  (surfaced via ``get_blocklist_metrics``), and returns False so a Redis
  outage does not turn into a full outage. The in-memory fallback still
  catches revocations made in this process (tests, single-instance dev).
- Refresh rotation: fail-CLOSED for reuse detection. ``refresh_token()``
  treats an unverifiable backend as a reason to reject rotation only when
  neither Redis nor memory can confirm freshness — in practice the memory
  fallback is always readable, so rotation stays available while reuse of
  a known-revoked refresh jti is always rejected with 401 + user-wide
  revocation + audit.

Storage:
- Per-token: key ``jwt_denylist:<jti>`` = "1" with TTL = token remaining
  lifetime (exp - now). Auto-expires from Redis after the token would have
  expired anyway.
- Per-user epoch for "log out everywhere" (logout, password change, role
  change, refresh reuse): key ``jwt_user_revoked:<user_id>`` = revoke epoch
  (unix seconds) with TTL = refresh lifetime (REFRESH_TOKEN_EXPIRE_DAYS,
  default 7d). Any token with iat < epoch is treated as revoked.
"""

import logging
import time

logger = logging.getLogger(__name__)

DENYLIST_PREFIX = "jwt_denylist:"
USER_REVOKE_PREFIX = "jwt_user_revoked:"


def access_ttl_seconds() -> int:
    """Access-token denylist TTL, derived from the single Config source."""
    from ..config.config import resolve_access_expire_minutes

    return resolve_access_expire_minutes() * 60


def refresh_ttl_seconds() -> int:
    """User-epoch denylist TTL, derived from the single Config source."""
    from ..config.config import resolve_refresh_expire_days

    return resolve_refresh_expire_days() * 24 * 3600


_memory_denylist: dict = {}
_memory_user_revoke: dict = {}
_backend_errors = 0


def _now() -> float:
    return time.time()


def _redis():
    try:
        from ..services.redis_client import get_redis

        return get_redis()
    except Exception:
        return None


def _purge_expired_memory() -> None:
    now = _now()
    for jti in [k for k, exp in _memory_denylist.items() if exp <= now]:
        _memory_denylist.pop(jti, None)


def _extract_user_id(jwt_payload: dict):
    identity = (jwt_payload or {}).get("identity", (jwt_payload or {}).get("sub"))
    if isinstance(identity, dict):
        return identity.get("user_id")
    if identity is not None:
        return identity
    return None


def revoke_token(jti: str, ttl_seconds: int) -> None:
    """Revoke a single jti for ttl_seconds. Writes memory + Redis (best effort)."""
    if not jti:
        return
    ttl = max(1, int(ttl_seconds))
    _memory_denylist[str(jti)] = _now() + ttl
    client = _redis()
    if client is None:
        return
    try:
        client.setex(f"{DENYLIST_PREFIX}{jti}", ttl, "1")
    except Exception as exc:
        global _backend_errors
        _backend_errors += 1
        logger.warning("token denylist Redis write failed (fail-open, memory kept): %s", exc)


def revoke_jwt_payload(jwt_payload: dict) -> None:
    """Revoke the token described by a decoded payload, TTL derived from exp."""
    if not jwt_payload:
        return
    jti = jwt_payload.get("jti")
    if not jti:
        return
    exp = jwt_payload.get("exp")
    if exp is not None:
        try:
            ttl = int(float(exp) - _now())
        except (TypeError, ValueError):
            ttl = access_ttl_seconds()
    else:
        ttl = refresh_ttl_seconds() if jwt_payload.get("type") == "refresh" else access_ttl_seconds()
    revoke_token(str(jti), max(1, ttl))


def revoke_all_user_tokens(user_id, ttl_seconds: int | None = None) -> None:
    """Epoch-revoke every token for a user issued before now (logout everywhere)."""
    if user_id is None:
        return
    if ttl_seconds is None:
        ttl_seconds = refresh_ttl_seconds()
    key = str(user_id)
    epoch = _now()
    _memory_user_revoke[key] = epoch
    client = _redis()
    if client is None:
        return
    try:
        client.setex(f"{USER_REVOKE_PREFIX}{key}", max(1, int(ttl_seconds)), str(epoch))
    except Exception as exc:
        global _backend_errors
        _backend_errors += 1
        logger.warning("user revoke Redis write failed (fail-open, memory kept): %s", exc)


def is_token_revoked(jwt_payload: dict) -> bool:
    """True when the jti is denylisted or the token predates a user-wide revoke.

    Fail-open: backend errors log a warning + metric and return the
    in-memory verdict (False when unknown) so availability survives a
    Redis outage.
    """
    if not jwt_payload:
        return False
    _purge_expired_memory()
    jti = jwt_payload.get("jti")
    if jti is not None and str(jti) in _memory_denylist:
        return True
    user_id = _extract_user_id(jwt_payload)
    if user_id is not None:
        epoch = _memory_user_revoke.get(str(user_id))
        if epoch is not None:
            try:
                iat = float(jwt_payload.get("iat", 0) or 0)
            except (TypeError, ValueError):
                iat = 0
            if iat and iat < float(epoch):
                return True
    client = _redis()
    if client is None:
        return False
    try:
        if jti is not None and client.exists(f"{DENYLIST_PREFIX}{jti}"):
            _memory_denylist[str(jti)] = _now() + access_ttl_seconds()
            return True
        if user_id is not None:
            raw = client.get(f"{USER_REVOKE_PREFIX}{user_id}")
            if raw is not None:
                try:
                    epoch = float(raw)
                except (TypeError, ValueError):
                    epoch = None
                if epoch is not None:
                    _memory_user_revoke[str(user_id)] = epoch
                    try:
                        iat = float(jwt_payload.get("iat", 0) or 0)
                    except (TypeError, ValueError):
                        iat = 0
                    if iat and iat < epoch:
                        return True
        return False
    except Exception as exc:
        global _backend_errors
        _backend_errors += 1
        logger.warning("token denylist Redis read failed (fail-open): %s", exc)
        return str(jti) in _memory_denylist if jti is not None else False


def get_blocklist_metrics() -> dict:
    """In-process observability: backend error count + memory sizes."""
    _purge_expired_memory()
    return {
        "backend_errors": _backend_errors,
        "memory_denylist_size": len(_memory_denylist),
        "memory_user_revokes": len(_memory_user_revoke),
    }


def reset_for_tests() -> None:
    """Clear in-memory state (and drop cached Redis client) for tests."""
    _memory_denylist.clear()
    _memory_user_revoke.clear()
    global _backend_errors
    _backend_errors = 0
    try:
        from ..services.redis_client import reset_for_tests as redis_reset

        redis_reset()
    except Exception:
        pass
