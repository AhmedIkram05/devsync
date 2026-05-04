# Authentication data validation

from flask import jsonify
import re
from ...auth.rbac import Role

def validate_login_data(data):
    """Validate login credentials"""
    if not all(k in data for k in ['email', 'password']):
        return jsonify({'message': 'Email and password required'}), 400
    
    # Validate email format
    email_pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
    if not re.match(email_pattern, data['email']):
        return jsonify({'message': 'Invalid email format'}), 400
    
    return None

def validate_registration_data(data):
    """Validate user registration data"""
    if not all(k in data for k in ['name', 'email', 'password', 'role']):
        return jsonify({'message': 'Missing required fields'}), 400
    
    # Validate email format
    email_pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
    if not re.match(email_pattern, data['email']):
        return jsonify({'message': 'Invalid email format'}), 400
    
    # Validate password length
    if len(data['password']) < 8:
        return jsonify({'message': 'Password must be at least 8 characters long'}), 400
    
    valid_roles = [role.value for role in Role]
    if data['role'] not in valid_roles:
        return jsonify({'message': f'Role must be one of: {", ".join(valid_roles)}'}), 400
    
    return None
