"""User API routes"""

from flask import request
from flask_jwt_extended import jwt_required
from ..controllers.users_controller import (
    get_all_users,
    get_user_by_id,
    update_user,
    delete_user,
    get_current_user_profile,
    update_current_user_profile
)
from ..middlewares.validation_middleware import validate_json
from ..middlewares import admin_required, role_required
from ...auth.rbac import Role

def register_routes(bp):
    """Register all user routes with the provided Blueprint"""
    
    @bp.route('/users', methods=['GET'])
    @jwt_required()
    @role_required([Role.ADMIN])
    def users_list():
        """Route to get all users"""
        return get_all_users()
    
    @bp.route('/users/<int:user_id>', methods=['GET'])
    @jwt_required()
    def get_user(user_id):
        """Route to get a specific user"""
        return get_user_by_id(user_id)
    
    @bp.route('/users/<int:user_id>', methods=['PUT'])
    @jwt_required()
    @admin_required()
    @validate_json()
    def update_user_route(user_id):
        """Route to update a user (admin only)"""
        return update_user(user_id)
    
    @bp.route('/users/<int:user_id>', methods=['DELETE'])
    @jwt_required()
    @admin_required()
    def delete_user_route(user_id):
        """Route to delete a user (admin only)"""
        return delete_user(user_id)
    
    @bp.route('/profile', methods=['GET'])
    @jwt_required()
    def get_profile():
        """Route to get current user's profile"""
        return get_current_user_profile()
    
    @bp.route('/profile', methods=['PUT'])
    @jwt_required()
    @validate_json()
    def update_profile():
        """Route to update current user's profile"""
        return update_current_user_profile()
