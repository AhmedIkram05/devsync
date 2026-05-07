"""Admin API routes"""

from flask import request
from flask_jwt_extended import jwt_required
from ..controllers.admin_controller import (
    get_system_stats,
    get_system_settings,
    update_system_settings,
    update_user_role
)
from ..middlewares import admin_required
from ..middlewares.validation_middleware import validate_json
from ..middlewares.rate_limiter import rate_limit
from ..controllers.users_controller import get_all_users, create_user, update_user, delete_user
from ...auth.rbac import Role, role_at_least

def register_routes(bp):
    """Register all admin routes with the provided Blueprint"""
    
    @bp.route('/admin/users', methods=['POST'])
    @jwt_required()
    @admin_required()
    @validate_json()
    def admin_create_user():
        """Route to create a user"""
        return create_user()

    @bp.route('/admin/stats', methods=['GET'])
    @jwt_required()
    @role_at_least(Role.TEAM_LEAD)
    @rate_limit(requests_per_window=20, window_seconds=60)
    def system_stats():
        """Route to get system statistics"""
        return get_system_stats()
    
    @bp.route('/admin/settings', methods=['GET'])
    @jwt_required()
    @admin_required()
    @rate_limit(requests_per_window=20, window_seconds=60)
    def system_settings():
        """Route to get system settings"""
        return get_system_settings()
    
    @bp.route('/admin/settings', methods=['PUT'])
    @jwt_required()
    @admin_required()
    @validate_json()
    @rate_limit(requests_per_window=10, window_seconds=60)
    def update_settings():
        """Route to update system settings"""
        return update_system_settings()
    
    @bp.route('/admin/users/<int:user_id>/role', methods=['PUT'])
    @jwt_required()
    @admin_required()
    @validate_json()
    @rate_limit(requests_per_window=10, window_seconds=60)
    def user_role_update(user_id):
        """Route to update a user's role"""
        return update_user_role(user_id)

    @bp.route('/admin/users', methods=['GET'])
    @jwt_required()
    @role_at_least(Role.TEAM_LEAD)
    def admin_get_all_users():
        """Route to get all users"""
        return get_all_users()

    @bp.route('/admin/users/<int:user_id>', methods=['PUT'])
    @jwt_required()
    @admin_required()
    @validate_json()
    def admin_update_user(user_id):
        """Route to update a user"""
        return update_user(user_id)

    @bp.route('/admin/users/<int:user_id>', methods=['DELETE'])
    @jwt_required()
    @admin_required()
    def admin_delete_user(user_id):
        """Route to delete a user"""
        return delete_user(user_id)
