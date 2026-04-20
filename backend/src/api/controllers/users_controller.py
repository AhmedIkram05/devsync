# User controller - business logic

from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity
from ...db.models import db, User  # Changed to relative import
from ...auth.helpers import hash_password, verify_password  # Changed to relative import
from ..validators.user_validator import validate_user_data, validate_profile_update  # Changed to relative import

def get_all_users():
    """Controller function to get all users"""
    users = User.query.all()
    
    users_data = [{
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'role': user.role,
        'github_username': user.github_username,
        'avatar': getattr(user, 'avatar', None),
        'created_at': user.created_at.isoformat() if user.created_at else None
    } for user in users]
    
    return jsonify({'users': users_data})

def get_user_by_id(user_id):
    """Controller function to get a specific user"""
    user = User.query.get_or_404(user_id)
    
    user_data = {
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'role': user.role,
        'github_username': user.github_username,
        'avatar': getattr(user, 'avatar', None),
        'created_at': user.created_at.isoformat() if user.created_at else None
    }
    
    return jsonify({'user': user_data})

def update_user(user_id):
    """Controller function to update a user (admin only)"""
    data = request.get_json()
    
    # Validate user data
    validation_result = validate_user_data(data)
    if validation_result:
        return validation_result
    
    user = User.query.get_or_404(user_id)
    
    # Update allowed fields
    if 'name' in data:
        user.name = data['name']
    if 'email' in data:
        # Check if email is already taken by another user
        existing_user = User.query.filter_by(email=data['email']).first()
        if existing_user and existing_user.id != user_id:
            return jsonify({'message': 'Email already in use'}), 409
        user.email = data['email']
    if 'role' in data:
        user.role = data['role']
    if 'password' in data and data['password']:
        user.password = hash_password(data['password'])
    if 'github_username' in data:
        user.github_username = data['github_username']
    if 'avatar' in data and hasattr(user, 'avatar'):
        user.avatar = data['avatar']
    
    db.session.commit()
    
    return jsonify({
        'message': 'User updated successfully',
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'role': user.role
        }
    })

def delete_user(user_id):
    """Controller function to delete a user (admin only)"""
    user = User.query.get_or_404(user_id)
    
    db.session.delete(user)
    db.session.commit()
    
    return jsonify({'message': 'User deleted successfully'})

def get_current_user_profile():
    """Controller function to get the current user's profile"""
    user_id = get_jwt_identity()['user_id']
    user = User.query.get_or_404(user_id)
    
    user_data = {
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'role': user.role,
        'github_username': user.github_username,
        'avatar': getattr(user, 'avatar', None),
        'created_at': user.created_at.isoformat() if user.created_at else None
    }
    
    return jsonify({'user': user_data})

def update_current_user_profile():
    """Controller function to update the current user's profile"""
    data = request.get_json()
    user_id = get_jwt_identity()['user_id']
    
    # Validate profile update data
    validation_result = validate_profile_update(data)
    if validation_result:
        return validation_result
    
    user = User.query.get_or_404(user_id)
    
    # Update allowed fields
    if 'name' in data:
        user.name = data['name']
    if 'email' in data:
        # Check if email is already taken by another user
        existing_user = User.query.filter_by(email=data['email']).first()
        if existing_user and existing_user.id != user_id:
            return jsonify({'message': 'Email already in use'}), 409
        user.email = data['email']
    if 'github_username' in data:
        user.github_username = data['github_username']
    if 'avatar' in data and hasattr(user, 'avatar'):
        user.avatar = data['avatar']
    if 'current_password' in data and 'new_password' in data:
        # Verify current password
        if not verify_password(data['current_password'], user.password):
            return jsonify({'message': 'Current password is incorrect'}), 400
        user.password = hash_password(data['new_password'])
    
    db.session.commit()
    
    return jsonify({
        'message': 'Profile updated successfully',
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email
        }
    })
