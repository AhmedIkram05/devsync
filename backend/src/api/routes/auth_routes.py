"""Authentication API routes"""

from flask import request
from flask_jwt_extended import jwt_required
# Import the actual authentication logic from auth folder
from ...auth.auth import login, register_user, refresh_token, logout_user, get_token  # Added get_token
from ..middlewares.validation_middleware import validate_json  # Changed to relative import
from ..validators.auth_validator import validate_login_data, validate_registration_data  # Changed to relative import
from ...auth.rbac import ROLE_PERMISSIONS

def register_routes(bp):
    """Register all authentication routes with the provided Blueprint"""
    
    @bp.route('/auth/login', methods=['POST'])
    @validate_json()
    def login_route():
        """Route for user login"""
        # Validate input data
        validation_error = validate_login_data(request.get_json())
        if validation_error:
            return validation_error
        return login()
    
    @bp.route('/auth/register', methods=['POST'])
    @validate_json()
    def register_route():
        """Route for user registration"""
        # Validate input data
        validation_error = validate_registration_data(request.get_json())
        if validation_error:
            return validation_error
        return register_user()
    
    @bp.route('/auth/refresh', methods=['POST'])
    @jwt_required(refresh=True)
    def refresh():
        """Route for refreshing access token"""
        return refresh_token()
    
    @bp.route('/auth/logout', methods=['POST'])
    @jwt_required()
    def logout():
        """Route for user logout"""
        return logout_user()
    
    @bp.route('/auth/me', methods=['GET'])
    @jwt_required()
    def me():
        """Route to get current authenticated user"""
        from ..controllers.users_controller import get_current_user_profile  # Changed to relative import
        return get_current_user_profile()
        
    @bp.route('/auth/token', methods=['POST'])
    @validate_json()
    def token_route():
        """Route to get an authentication token directly"""
        # Validate input data
        validation_error = validate_login_data(request.get_json())
        if validation_error:
            return validation_error
        return get_token()

    @bp.route('/auth/permissions', methods=['GET'])
    @jwt_required()
    def get_permissions():
        """Route to get permissions for the current user"""
        from flask_jwt_extended import get_jwt
        claims = get_jwt()
        role = claims.get('role', 'developer')
        permissions = ROLE_PERMISSIONS.get(role, [])
        from flask import jsonify
        return jsonify({
            'role': role,
            'permissions': permissions
        })
