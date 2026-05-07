# This file contains the routes for user authentication

from flask import Blueprint, request, jsonify, make_response, current_app
from flask_jwt_extended import (
    jwt_required, get_jwt_identity, get_jwt, 
    set_access_cookies, set_refresh_cookies, unset_jwt_cookies,
    create_access_token
)
from sqlalchemy.exc import IntegrityError

from ..db.models import db, User  # Fix import path
from .helpers import hash_password, verify_password, generate_tokens
from .rbac import Role
from ..services import audit_service, settings_service


def register_user():
    """Function to register a new user.

    Security: the role field from the request body is **ignored**.
    All new accounts are created with the 'developer' role.
    Admins can promote users after registration via PUT /admin/users/<id>/role.
    """
    data = request.get_json()

    # Validate required fields (role is no longer required from the client)
    if not all(k in data for k in ['name', 'email', 'password']):
        return jsonify({'message': 'Missing required fields'}), 400

    # Check if email already exists
    existing_user = User.query.filter_by(email=data['email']).first()
    if existing_user:
        return jsonify({'message': 'Email already registered'}), 409

    # If this is the very first user, automatically make them an admin
    user_count = User.query.count()
    if user_count == 0:
        forced_role = Role.ADMIN.value
        print(f"First user registration detected! Automatically granting admin role to {data['email']}")
    else:
        # Otherwise get default role from settings
        forced_role = settings_service.get_default_role()
        
    print(f"Registering user: {data['email']} with role: {forced_role} (ignoring any client-supplied role)")

    try:
        new_user = User(
            name=data['name'],
            email=data['email'],
            password=hash_password(data['password']),
            role=forced_role
        )

        db.session.add(new_user)
        db.session.commit()

        # Record audit log
        audit_service.record(
            action='user_registered',
            actor={'user_id': new_user.id, 'role': new_user.role},
            resource_type='user',
            resource_id=new_user.id
        )

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
                'token': tokens['access_token']
            }
        })

        # Set cookies
        set_access_cookies(resp, tokens['access_token'])
        set_refresh_cookies(resp, tokens['refresh_token'])

        return resp, 201

    except Exception as e:
        db.session.rollback()
        print(f"Registration error: {str(e)}")
        return jsonify({'message': f'An error occurred while registering the user: {str(e)}'}), 500

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
    
    # Record audit log
    audit_service.record(
        action='user_login',
        actor={'user_id': user.id, 'role': user.role},
        resource_type='user',
        resource_id=user.id
    )

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

def refresh_token():
    """Function to refresh an access token"""
    current_user = get_jwt_identity()
    claims = get_jwt()
    role = claims.get('role')
    user_id = current_user.get('user_id') if isinstance(current_user, dict) else current_user

    if not role and user_id:
        user = User.query.get(user_id)
        if user:
            role = user.role

    additional_claims = {'role': role} if role else {}
    
    # Create new access token
    access_token = create_access_token(identity=current_user, additional_claims=additional_claims)
    
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
