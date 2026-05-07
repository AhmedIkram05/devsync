"""Audit Log API routes"""

from flask import request
from flask_jwt_extended import jwt_required
from ..controllers.audit_controller import get_audit_logs, get_audit_log_by_id
from ..middlewares import admin_required

def register_routes(bp):
    """Register all audit routes with the provided Blueprint"""
    
    @bp.route('/admin/audit-logs', methods=['GET'])
    @jwt_required()
    @admin_required()
    def get_audit_logs_route():
        """Route to get all audit logs (Admin only)"""
        return get_audit_logs()
        
    @bp.route('/admin/audit-logs/<int:log_id>', methods=['GET'])
    @jwt_required()
    @admin_required()
    def get_audit_log_route(log_id):
        """Route to get a single audit log (Admin only)"""
        return get_audit_log_by_id(log_id)
