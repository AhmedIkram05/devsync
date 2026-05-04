# User data validation

from flask import jsonify
import re
from ...auth.rbac import Role

def validate_user_data(data):
    """Validate user data from requests"""
    # Validate email if provided
    if 'email' in data:
        email_pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
        if not re.match(email_pattern, data['email']):
            return jsonify({'message': 'Invalid email format'}), 400
    
    # Validate name if provided
    if 'name' in data and (len(data['name']) < 2 or len(data['name']) > 100):
        return jsonify({'message': 'Name must be between 2 and 100 characters'}), 400
    
    # Validate role if provided
    if 'role' in data:
        valid_roles = [role.value for role in Role]
        if data['role'] not in valid_roles:
            return jsonify({'message': f'Role must be one of: {", ".join(valid_roles)}'}), 400
    
    # Validate password if provided
    if 'password' in data and data['password']:
        if len(data['password']) < 8:
            return jsonify({'message': 'Password must be at least 8 characters long'}), 400
    
    # If validation passes, return None
    return None

def validate_profile_update(data):
    """Validate profile update data"""
    # Validate email if provided
    if 'email' in data:
        email_pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
        if not re.match(email_pattern, data['email']):
            return jsonify({'message': 'Invalid email format'}), 400
    
    # Validate name if provided
    if 'name' in data and (len(data['name']) < 2 or len(data['name']) > 100):
        return jsonify({'message': 'Name must be between 2 and 100 characters'}), 400
    
    # Validate password change if provided
    if ('current_password' in data and 'new_password' not in data) or \
       ('new_password' in data and 'current_password' not in data):
        return jsonify({'message': 'Both current password and new password are required for password change'}), 400
    
    if 'new_password' in data and len(data['new_password']) < 8:
        return jsonify({'message': 'New password must be at least 8 characters long'}), 400
    
    # If validation passes, return None
    return None
