"""Notification API routes"""

from flask import request
from flask_jwt_extended import jwt_required
from ..controllers.notifications_controller import (
    get_user_notifications,
    create_notification,
    mark_notification_read,
    mark_all_notifications_read,
    delete_notification
)
from ..middlewares.validation_middleware import validate_json
from ...auth.rbac import require_permission

def register_routes(bp):
    """Register all notification routes with the provided Blueprint"""
    
    @bp.route('/notifications', methods=['GET'])
    @jwt_required()
    def notifications_list():
        """Route to get all notifications for user"""
        return get_user_notifications()
    
    @bp.route('/notifications', methods=['POST'])
    @jwt_required()
    @validate_json()
    def create_notification_route():
        """Route to create a notification"""
        return create_notification()
    
    @bp.route('/notifications/<int:notification_id>/read', methods=['PUT'])
    @jwt_required()
    def mark_read(notification_id):
        """Route to mark a notification as read"""
        return mark_notification_read(notification_id)
    
    @bp.route('/notifications/read-all', methods=['PUT'])
    @jwt_required()
    def mark_all_read():
        """Route to mark all notifications as read"""
        return mark_all_notifications_read()
    
    @bp.route('/notifications/<int:notification_id>', methods=['DELETE'])
    @jwt_required()
    @require_permission('can_manage_personal_notifications')
    def delete_notification_route(notification_id):
        """Route to delete a notification"""
        return delete_notification(notification_id)
