# This file contains the routes for user authentication

from flask import Blueprint, request, jsonify, make_response, current_app
from flask_jwt_extended import (
    jwt_required, get_jwt_identity, get_jwt, 
    set_access_cookies, set_refresh_cookies, unset_jwt_cookies,
    create_access_token  # Added missing import
)
from sqlalchemy.exc import IntegrityError

from ..db.models import db, User  # Fix import path
from .helpers import hash_password, verify_password, generate_tokens

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    
    # Validate required fields
    if not all(k in data for k in ['name', 'email', 'password', 'role']):
        return jsonify({'message': 'Missing required fields'}), 400
    
    # Check if email already exists
    existing_user = User.query.filter_by(email=data['email']).first()
    if existing_user:
        return jsonify({'message': 'Email already registered'}), 409
    
    # Create new user
    try:
        new_user = User(
            name=data['name'],
            email=data['email'],
            password=hash_password(data['password']),
            role=data['role']
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        # Generate tokens for the new user
        tokens = generate_tokens(new_user.id, {'role': new_user.role})
        
        # Create response with tokens
        resp = jsonify({
            'message': 'User registered successfully',
            'user': {
                'id': new_user.id,
                'name': new_user.name,
                'email': new_user.email,
                'role': new_user.role
            }
        })
        
        # Set cookies
        set_access_cookies(resp, tokens['access_token'])
        set_refresh_cookies(resp, tokens['refresh_token'])
        
        return resp, 201
    
    except IntegrityError:
        db.session.rollback()
        return jsonify({'message': 'An error occurred while registering the user'}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    """Function to authenticate a user and create a session"""
    data = request.get_json()
    
    # Validate required fields
    if not all(k in data for k in ['email', 'password']):
        return jsonify({'message': 'Missing email or password'}), 400
    
    # Find user by email
    print(f"Attempting to login user: {data['email']}")
    user = User.query.filter_by(email=data['email']).first()
    
    # Check if user exists and password is correct
    if not user:
        print(f"User not found: {data['email']}")
        return jsonify({'message': 'Invalid email or password'}), 401
        
    if not verify_password(data['password'], user.password):
        print(f"Invalid password for user: {data['email']}")
        return jsonify({'message': 'Invalid email or password'}), 401
    
    # Generate tokens
    tokens = generate_tokens(user.id, {'role': user.role})
    print(f"Login successful for user: {user.email}, role: {user.role}")
    
    # Check for GitHub connection
    from ..db.models.models import GitHubToken
    github_token = GitHubToken.query.filter_by(user_id=user.id).first()
    github_connected = github_token is not None
    github_username = user.github_username
    
    # Create response
    resp = jsonify({
        'message': 'Login successful',
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'role': user.role,
            'token': tokens['access_token'],  # Include token in response
            'github_connected': github_connected,
            'github_username': github_username
        }
    })
    
    # Set cookies
    set_access_cookies(resp, tokens['access_token'])
    set_refresh_cookies(resp, tokens['refresh_token'])
    
    return resp

@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Endpoint for refreshing an access token"""
    current_user = get_jwt_identity()
    
    # Create new access token
    access_token = create_access_token(identity=current_user)
    
    # Create response
    resp = jsonify({
        'message': 'Token refreshed successfully',
        'token': access_token
    })
    
    # Set new access cookie
    set_access_cookies(resp, access_token)
    
    return resp

@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Endpoint for logging out a user"""
    resp = jsonify({'message': 'Logout successful'})
    
    # Remove JWT cookies
    unset_jwt_cookies(resp)
    
    return resp

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    """Get current user information"""
    current_user = get_jwt_identity()
    
    user = User.query.get(current_user['user_id'])
    if not user:
        return jsonify({'message': 'User not found'}), 404
    
    return jsonify({
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'role': user.role
        }
    })

def register_user():
    """Function to register a new user"""
    data = request.get_json()
    
    # Validate required fields
    if not all(k in data for k in ['name', 'email', 'password', 'role']):
        return jsonify({'message': 'Missing required fields'}), 400
    
    # Check if email already exists
    existing_user = User.query.filter_by(email=data['email']).first()
    if existing_user:
        return jsonify({'message': 'Email already registered'}), 409
    
    # Create new user
    try:
        # Print debug information
        print(f"Attempting to register user: {data['email']} with role: {data['role']}")
        
        new_user = User(
            name=data['name'],
            email=data['email'],
            password=hash_password(data['password']),
            role=data['role']
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        # Generate tokens for the new user
        tokens = generate_tokens(new_user.id, {'role': new_user.role})
        
        # Create response with tokens
        resp = jsonify({
            'message': 'User registered successfully',
            'user': {
                'id': new_user.id,
                'name': new_user.name,
                'email': new_user.email,
                'role': new_user.role,
                'token': tokens['access_token']  # Include token in response for frontend
            }
        })
        
        # Set cookies
        set_access_cookies(resp, tokens['access_token'])
        set_refresh_cookies(resp, tokens['refresh_token'])
        
        return resp, 201
    
    except Exception as e:
        # Enhanced error handling to catch all exceptions
        db.session.rollback()
        print(f"Registration error: {str(e)}")
        return jsonify({'message': f'An error occurred while registering the user: {str(e)}'}), 500

def refresh_token():
    """Function to refresh an access token"""
    current_user = get_jwt_identity()
    
    # Create new access token
    access_token = create_access_token(identity=current_user)
    
    # Create response
    resp = jsonify({
        'message': 'Token refreshed successfully',
        'token': access_token
    })
    
    # Set new access cookie
    set_access_cookies(resp, access_token)
    
    return resp

def logout_user():
    """Function to log out a user"""
    resp = jsonify({'message': 'Logout successful'})
    
    # Remove JWT cookies
    unset_jwt_cookies(resp)
    
    return resp

# Add a dedicated token endpoint for the frontend to use
def get_token():
    """Function to get a token for an already authenticated user"""
    data = request.get_json()
    
    # Validate required fields
    if not all(k in data for k in ['email', 'password']):
        return jsonify({'message': 'Missing email or password'}), 400
    
    # Find user by email
    user = User.query.filter_by(email=data['email']).first()
    
    # Check if user exists and password is correct
    if not user:
        return jsonify({'message': 'Invalid email or password'}), 401
        
    if not verify_password(data['password'], user.password):
        return jsonify({'message': 'Invalid email or password'}), 401
    
    # Generate tokens
    tokens = generate_tokens(user.id, {'role': user.role})
    
    # Create response with just the token
    response = jsonify({
        'token': tokens['access_token'],
        'user_id': user.id,
        'role': user.role
    })
    
    # Set cookies
    set_access_cookies(response, tokens['access_token'])
    set_refresh_cookies(response, tokens['refresh_token'])
    
    return response
