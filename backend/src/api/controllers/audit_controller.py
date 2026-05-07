"""Audit Log Controller"""

from flask import request, jsonify
from ...db.models import AuditLog

def get_audit_logs():
    """Get paginated and filtered audit logs"""
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
    
    logs_data = [{
        'id': log.id,
        'actor_user_id': log.actor_user_id,
        'actor_role': log.actor_role,
        'action': log.action,
        'resource_type': log.resource_type,
        'resource_id': log.resource_id,
        'ip': log.ip,
        'user_agent': log.user_agent,
        'metadata': log.metadata_info,
        'created_at': log.created_at.isoformat() if log.created_at else None
    } for log in pagination.items]
    
    return jsonify({
        'logs': logs_data,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })

def get_audit_log_by_id(log_id):
    """Get a specific audit log"""
    log = AuditLog.query.get_or_404(log_id)
    
    return jsonify({
        'log': {
            'id': log.id,
            'actor_user_id': log.actor_user_id,
            'actor_role': log.actor_role,
            'action': log.action,
            'resource_type': log.resource_type,
            'resource_id': log.resource_id,
            'ip': log.ip,
            'user_agent': log.user_agent,
            'metadata': log.metadata_info,
            'created_at': log.created_at.isoformat() if log.created_at else None
        }
    })
