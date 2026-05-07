# Authentication data validation

from flask import jsonify
import re
from ...auth.rbac import Role

def validate_login_data(data):
    """Validate login credentials"""
    if not all(k in data for k in ['email', 'password']):
        return jsonify({'message': 'Email and password required'}), 400
    
    # Relaxed email pattern to support plus signs, subdomains, etc.
    email_pattern = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    if not re.match(email_pattern, data['email']):
        return jsonify({'message': 'Invalid email format'}), 400
    
    return None

def validate_registration_data(data):
    """Validate user registration data.

    Note: the ``role`` field is **not** required.  The backend always forces
    new registrations to the ``developer`` role for security.
    """
    if not all(k in data for k in ['name', 'email', 'password']):
        return jsonify({'message': 'Missing required fields'}), 400

    # Relaxed email pattern to support plus signs, subdomains, etc.
    email_pattern = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    if not re.match(email_pattern, data['email']):
        return jsonify({'message': 'Invalid email format'}), 400

    # Validate password length
    if len(data['password']) < 8:
        return jsonify({'message': 'Password must be at least 8 characters long'}), 400

    return None
