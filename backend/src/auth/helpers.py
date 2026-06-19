# Authentication helper functions

import bcrypt
from flask_jwt_extended import create_access_token, create_refresh_token


def hash_password(password):
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(password, hashed_password):
    """Verify that a password matches a hash"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))

def generate_tokens(user_id, additional_claims=None):
    """Generate access and refresh tokens for a user"""
    identity = {'user_id': user_id}
    claims = additional_claims or {}

    access_token = create_access_token(identity=identity, additional_claims=claims)
    refresh_token = create_refresh_token(identity=identity, additional_claims=claims)

    return {
        'access_token': access_token,
        'refresh_token': refresh_token
    }
