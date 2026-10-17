"""Audit Logging Service"""

import contextlib
import hashlib
import hmac
import logging
import os

from flask import current_app, request
from flask_jwt_extended import get_jwt, get_jwt_identity

from ..db.models import AuditLog, db
from ..db.transaction import commit_or_flush, in_managed_transaction
from ..socketio_server import emit_dashboard_refresh

logger = logging.getLogger(__name__)


def _current_secret(key):
    """Read a Flask config secret, falling back to the environment."""
    try:
        value = current_app.config.get(key)
    except RuntimeError:
        value = None
    return value or os.getenv(key)


def _audit_pepper():
    """Stable server-side pepper for IP hashing. Falls back to the app's own
    secret keys so no new secret is required; if none are available the IP is
    simply not recorded (never stored raw)."""
    explicit = os.getenv("AUDIT_IP_PEPPER")
    if explicit:
        return explicit.encode()
    for key in ("SECRET_KEY", "JWT_SECRET_KEY"):
        value = _current_secret(key)
        if value:
            return hmac.new(str(value).encode(), b"devsync-audit-ip", hashlib.sha256).digest()
    return None


def _hashed_ip(raw_ip):
    """HMAC-SHA256 of the client IP (truncated to fit AuditLog.ip); None when
    there is no IP or no pepper. Raw IPs are never persisted."""
    if not raw_ip:
        return None
    pepper = _audit_pepper()
    if pepper is None:
        return None
    digest = hmac.new(pepper, str(raw_ip).encode(), hashlib.sha256).hexdigest()
    return digest[:45]


def record(action, *, actor=None, resource_type=None, resource_id=None, metadata=None):
    """
    Record an audit log entry. Does not fail the request if it errors.

    Args:
        action (str): The action performed (e.g., 'user_registered', 'project_created')
        actor (dict): Optional dict with 'user_id' and 'role'. If not provided, tries to extract from JWT.
        resource_type (str): Optional type of resource affected (e.g., 'user', 'project')
        resource_id (str): Optional ID of the resource affected
        metadata (dict): Optional extra metadata JSON
    """
    try:
        actor_id = None
        actor_role = None

        if actor:
            actor_id = actor.get("user_id")
            actor_role = actor.get("role")
        else:
            try:
                # Try to get from JWT if active context exists
                identity = get_jwt_identity()
                if identity:
                    actor_id = identity.get("user_id") if isinstance(identity, dict) else identity
                    claims = get_jwt()
                    if claims:
                        actor_role = claims.get("role")
            except Exception:
                logger.debug("audit actor lookup failed", exc_info=True)

        ip = None
        user_agent = None
        try:
            if request:
                ip = _hashed_ip(request.remote_addr)
                user_agent = request.user_agent.string if request.user_agent else None
        except Exception:
            logger.debug("audit request context lookup failed", exc_info=True)

        audit_entry = AuditLog(
            actor_user_id=actor_id,
            actor_role=actor_role,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            ip=ip,
            user_agent=user_agent,
            metadata_info=metadata,
        )

        if in_managed_transaction():
            # The caller shares this session, so the audit insert gets its own
            # savepoint: a failure unwinds only the audit row, never the
            # request's real work.
            savepoint = db.session.begin_nested()
            try:
                db.session.add(audit_entry)
                db.session.flush()
            except Exception:
                savepoint.rollback()
                raise
        else:
            db.session.add(audit_entry)
            commit_or_flush(db)

        emit_dashboard_refresh(
            "audit_log_recorded",
            resource_type=resource_type,
            resource_id=resource_id,
            payload={
                "action": action,
                "metadata": metadata or {},
            },
            # Room-scope when the audited action carries a project (task_* do);
            # system-wide actions (user_*, settings_*) stay global.
            project_id=(metadata or {}).get("project_id"),
        )
    except Exception as e:
        logger.error(f"Failed to record audit log '{action}': {str(e)}")
        # Inside a @transactional request the session also carries the caller's
        # work, so rolling back here would discard the whole request; the
        # savepoint path above is the only thing allowed to unwind audit work.
        if not in_managed_transaction():
            with contextlib.suppress(Exception):
                db.session.rollback()
