# Admin operations validation

from flask import jsonify
from ...auth.rbac import Role

def validate_system_settings(data):
    """Validate system settings data"""
    # Check for required fields
    if not data:
        return jsonify({'message': 'No settings provided'}), 400
    
    # Validate app_name if provided
    if 'app_name' in data:
        if not isinstance(data['app_name'], str) or len(data['app_name']) < 3:
            return jsonify({'message': 'App name must be between 3 and 100 characters'}), 400

    # Validate boolean fields
    for bool_field in ['allow_registration', 'github_integration_enabled']:
        if bool_field in data and not isinstance(data[bool_field], bool):
            return jsonify({'message': f'{bool_field} must be a boolean value'}), 400

    # Validate default_user_role if provided
    if 'default_user_role' in data:
        valid_roles = [role.value for role in Role]
        if data['default_user_role'] not in valid_roles:
            return jsonify({'message': f'Default user role must be one of: {", ".join(valid_roles)}'}), 400
    
    # Validate notification_settings if provided
    if 'notification_settings' in data:
        if not isinstance(data['notification_settings'], dict):
            return jsonify({'message': 'notification_settings must be an object'}), 400
        
        # Validate each notification setting
        for key, value in data['notification_settings'].items():
            if not isinstance(value, bool):
                return jsonify({'message': f'Notification setting "{key}" must be a boolean value'}), 400

    # If validation passes, return None
    return None

def validate_user_role_update(data):
    """Validate user role update data"""
    # Check for required fields
    if 'role' not in data:
        return jsonify({'message': 'Role is required'}), 400
    
    # Validate role
    valid_roles = [role.value for role in Role]
    if data['role'] not in valid_roles:
        return jsonify({'message': f'Role must be one of: {", ".join(valid_roles)}'}), 400
    
    # If validation passes, return None
    return None
