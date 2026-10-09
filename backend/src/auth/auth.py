# This file contains the routes for user authentication

import logging

from flask import jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    set_access_cookies,
    set_refresh_cookies,
    unset_jwt_cookies,
)

from ..db.models import User, db  # Fix import path
from ..services import audit_service, settings_service
from .helpers import generate_tokens, hash_password, verify_password
from .rbac import Role
from .token_blocklist import is_token_revoked, revoke_all_user_tokens, revoke_jwt_payload

logger = logging.getLogger(__name__)


def _identity_user_id(identity):
    if isinstance(identity, dict):
        return identity.get("user_id")
    return identity


def register_user():
    """Function to register a new user.

    Security: the role field from the request body is **ignored**.
    All new accounts are created with the 'developer' role.
    Admins can promote users after registration via PUT /admin/users/<id>/role.
    """
    data = request.get_json()

    # Validate required fields (role is no longer required from the client)
    if not all(k in data for k in ["name", "email", "password"]):
        return jsonify({"message": "Missing required fields"}), 400

    # Check if email already exists
    existing_user = User.query.filter_by(email=data["email"]).first()
    if existing_user:
        return jsonify({"message": "Email already registered"}), 409

    # Respect admin-controlled registration policy after the first admin bootstrap user
    user_count = User.query.count()
    allow_self_registration = settings_service.get_bool_setting("allow_self_registration", True)
    if user_count > 0 and not allow_self_registration:
        return jsonify({"message": "User registration is currently disabled by an administrator"}), 403

    # If this is the very first user, automatically make them an admin
    if user_count == 0:
        forced_role = Role.ADMIN.value
        print(f"First user registration detected! Automatically granting admin role to {data['email']}")
    else:
        # Otherwise get default role from settings
        forced_role = settings_service.get_default_role()

    print(f"Registering user: {data['email']} with role: {forced_role} (ignoring any client-supplied role)")

    try:
        new_user = User(
            name=data["name"], email=data["email"], password=hash_password(data["password"]), role=forced_role
        )

        db.session.add(new_user)
        db.session.commit()

        # Record audit log
        audit_service.record(
            action="user_registered",
            actor={"user_id": new_user.id, "role": new_user.role},
            resource_type="user",
            resource_id=new_user.id,
        )

        # Generate tokens for the new user
        tokens = generate_tokens(new_user.id, {"role": new_user.role})

        # Create response with profile only — JWTs travel via HttpOnly cookies.
        resp = jsonify(
            {
                "message": "User registered successfully",
                "user": {
                    "id": new_user.id,
                    "name": new_user.name,
                    "email": new_user.email,
                    "role": new_user.role,
                },
            }
        )

        # Set cookies
        set_access_cookies(resp, tokens["access_token"])
        set_refresh_cookies(resp, tokens["refresh_token"])

        return resp, 201

    except Exception as e:
        db.session.rollback()
        print(f"Registration error: {str(e)}")
        return jsonify({"message": f"An error occurred while registering the user: {str(e)}"}), 500


def login():
    """Function to authenticate a user and create a session"""
    data = request.get_json()

    # Validate required fields
    if not all(k in data for k in ["email", "password"]):
        return jsonify({"message": "Missing email or password"}), 400

    # Find user by email
    print(f"Attempting to login user: {data['email']}")
    user = User.query.filter_by(email=data["email"]).first()

    # Check if user exists and password is correct
    if not user:
        print(f"User not found: {data['email']}")
        return jsonify({"message": "Invalid email or password"}), 401

    if not verify_password(data["password"], user.password):
        print(f"Invalid password for user: {data['email']}")
        return jsonify({"message": "Invalid email or password"}), 401

    # Generate tokens
    tokens = generate_tokens(user.id, {"role": user.role})
    print(f"Login successful for user: {user.email}, role: {user.role}")

    # Check for GitHub connection
    from ..db.models.models import GitHubToken

    github_token = GitHubToken.query.filter_by(user_id=user.id).first()
    github_connected = github_token is not None
    github_username = user.github_username

    # Record audit log
    audit_service.record(
        action="user_login", actor={"user_id": user.id, "role": user.role}, resource_type="user", resource_id=user.id
    )

    # Create response with profile only — JWTs travel via HttpOnly cookies.
    resp = jsonify(
        {
            "message": "Login successful",
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role,
                "github_connected": github_connected,
                "github_username": github_username,
            },
        }
    )

    # Set cookies
    set_access_cookies(resp, tokens["access_token"])
    set_refresh_cookies(resp, tokens["refresh_token"])

    return resp


def refresh_token():
    """Rotate refresh token: revoke old refresh jti, issue new access+refresh pair.

    Reuse detection (fail-closed): presenting an already-revoked refresh jti
    revokes all user tokens, records an audit event, and returns 401.
    """
    claims = get_jwt()
    current_user = get_jwt_identity()
    user_id = _identity_user_id(current_user)

    if claims.get("jti") and is_token_revoked(claims):
        if user_id is not None:
            revoke_all_user_tokens(user_id)
        try:
            audit_service.record(
                action="refresh_reuse_detected",
                actor={"user_id": user_id, "role": claims.get("role")},
                resource_type="user",
                resource_id=user_id,
            )
        except Exception:
            logger.warning("refresh reuse audit failed", exc_info=True)
        return jsonify({"message": "Refresh token has been revoked"}), 401

    # Rotation: single-use refresh — revoke the presenting jti first.
    if claims.get("jti"):
        revoke_jwt_payload(claims)

    role = claims.get("role")
    if not role and user_id:
        user = User.query.get(user_id)
        if user:
            role = user.role

    additional_claims = {"role": role} if role else {}

    # Create new access + refresh pair
    access_token = create_access_token(identity=current_user, additional_claims=additional_claims)
    new_refresh_token = create_refresh_token(identity=current_user, additional_claims=additional_claims)

    # Create response without raw tokens — rotated pair travels via HttpOnly cookies.
    resp = jsonify({"message": "Token refreshed successfully"})

    # Set new cookies
    set_access_cookies(resp, access_token)
    set_refresh_cookies(resp, new_refresh_token)

    return resp


def logout_user():
    """Revoke the presenting token + all user tokens, then clear cookies."""
    try:
        claims = get_jwt()
        if claims.get("jti"):
            revoke_jwt_payload(claims)
        user_id = _identity_user_id(get_jwt_identity())
        if user_id is not None:
            # Epoch-revoke covers the paired refresh jti and other sessions.
            revoke_all_user_tokens(user_id)
        try:
            audit_service.record(
                action="user_logout",
                actor={"user_id": user_id, "role": (claims.get("role") if claims else None)},
                resource_type="user",
                resource_id=user_id,
            )
        except Exception:
            logger.warning("logout audit failed", exc_info=True)
    except Exception as exc:
        # Never fail logout itself on revocation backend errors.
        logger.warning("logout revocation failed (cookies still cleared): %s", exc)

    resp = jsonify({"message": "Logout successful"})

    # Remove JWT cookies
    unset_jwt_cookies(resp)

    return resp


# Add a dedicated token endpoint for the frontend to use
def get_token():
    """Function to get a token for an already authenticated user"""
    data = request.get_json()

    # Validate required fields
    if not all(k in data for k in ["email", "password"]):
        return jsonify({"message": "Missing email or password"}), 400

    # Find user by email
    user = User.query.filter_by(email=data["email"]).first()

    # Check if user exists and password is correct
    if not user:
        return jsonify({"message": "Invalid email or password"}), 401

    if not verify_password(data["password"], user.password):
        return jsonify({"message": "Invalid email or password"}), 401

    # Generate tokens
    tokens = generate_tokens(user.id, {"role": user.role})

    # Create response with profile only — token travels via HttpOnly cookies.
    response = jsonify({"message": "Token issued", "user_id": user.id, "role": user.role})

    # Set cookies
    set_access_cookies(response, tokens["access_token"])
    set_refresh_cookies(response, tokens["refresh_token"])

    return response
