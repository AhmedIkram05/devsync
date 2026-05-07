"""Audit Logging Service"""
import logging
from flask import request
from flask_jwt_extended import get_jwt_identity, get_jwt
from ..db.models import db, AuditLog

logger = logging.getLogger(__name__)

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
            actor_id = actor.get('user_id')
            actor_role = actor.get('role')
        else:
            try:
                # Try to get from JWT if active context exists
                identity = get_jwt_identity()
                if identity:
                    actor_id = identity.get('user_id') if isinstance(identity, dict) else identity
                    claims = get_jwt()
                    if claims:
                        actor_role = claims.get('role')
            except Exception:
                pass

        ip = None
        user_agent = None
        try:
            if request:
                ip = request.remote_addr
                user_agent = request.user_agent.string if request.user_agent else None
        except Exception:
            pass

        audit_entry = AuditLog(
            actor_user_id=actor_id,
            actor_role=actor_role,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            ip=ip,
            user_agent=user_agent,
            metadata_info=metadata
        )

        db.session.add(audit_entry)
        db.session.commit()
    except Exception as e:
        logger.error(f"Failed to record audit log '{action}': {str(e)}")
        try:
            db.session.rollback()
        except Exception:
            pass
