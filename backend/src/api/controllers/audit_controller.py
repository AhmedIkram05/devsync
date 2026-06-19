"""Audit Log Controller"""

from flask import jsonify, request

from ...db.models import AuditLog, User
from ...services import settings_service


def _build_actor_name_map(logs):
    actor_ids = {log.actor_user_id for log in logs if getattr(log, 'actor_user_id', None) is not None}
    if not actor_ids:
        return {}

    users = User.query.filter(User.id.in_(actor_ids)).all()
    return {user.id: user.name for user in users}


def _serialize_audit_log(log, actor_name_map=None):
    actor_name_map = actor_name_map or {}
    actor_user_id = log.actor_user_id

    return {
        'id': log.id,
        'actor_user_id': actor_user_id,
        'actor_name': actor_name_map.get(actor_user_id),
        'actor_role': log.actor_role,
        'action': log.action,
        'resource_type': log.resource_type,
        'resource_id': log.resource_id,
        'ip': log.ip,
        'user_agent': log.user_agent,
        'metadata': log.metadata_info,
        'created_at': log.created_at.isoformat() if log.created_at else None
    }

def get_audit_logs():
    """Get paginated and filtered audit logs"""
    settings_service.cleanup_old_audit_logs()

    action = request.args.get('action')
    actor_id = request.args.get('actor')
    from_date = request.args.get('from')
    to_date = request.args.get('to')

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)

    query = AuditLog.query

    if action:
        query = query.filter(AuditLog.action.ilike(f'%{action}%'))
    if actor_id:
        query = query.filter_by(actor_user_id=actor_id)
    if from_date:
        query = query.filter(AuditLog.created_at >= from_date)
    if to_date:
        query = query.filter(AuditLog.created_at <= to_date)

    pagination = query.order_by(AuditLog.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    actor_name_map = _build_actor_name_map(pagination.items)
    logs_data = [_serialize_audit_log(log, actor_name_map) for log in pagination.items]

    return jsonify({
        'logs': logs_data,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


def cleanup_audit_logs():
    """Delete expired audit logs using the configured retention window."""
    deleted_count = settings_service.cleanup_old_audit_logs()
    return jsonify({
        'message': 'Audit log cleanup completed',
        'deleted': deleted_count,
    }), 200

def get_audit_log_by_id(log_id):
    """Get a specific audit log"""
    log = AuditLog.query.get_or_404(log_id)
    actor_name = None

    if log.actor_user_id is not None:
        actor = User.query.get(log.actor_user_id)
        actor_name = actor.name if actor else None

    return jsonify({
        'log': {
            **_serialize_audit_log(log, {log.actor_user_id: actor_name} if actor_name else {}),
        }
    })
