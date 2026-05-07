"""User API routes"""

from flask import request
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
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
from ...auth.rbac import Role, _role_level, role_at_least

def register_routes(bp):
    """Register all user routes with the provided Blueprint"""
    
    @bp.route('/users', methods=['GET'])
    @jwt_required()
    @role_at_least(Role.DEVELOPER)
    def users_list():
        """Route to get all users"""
        return get_all_users()
    
    @bp.route('/users/<int:user_id>', methods=['GET'])
    @jwt_required()
    def get_user(user_id):
        """Route to get a specific user.

        Developers may only view their own profile.
        Team leads and admins may view any profile.
        """
        identity = get_jwt_identity()
        claims = get_jwt()
        caller_id = identity.get('user_id') if isinstance(identity, dict) else identity
        caller_role = claims.get('role', '')

        is_self = int(caller_id) == int(user_id)
        is_elevated = _role_level(caller_role) >= _role_level(Role.TEAM_LEAD.value)

        if not is_self and not is_elevated:
            return {'message': 'You can only view your own profile'}, 403

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
