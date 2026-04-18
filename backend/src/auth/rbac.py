# Role-Based Access Control (RBAC) implementation

from enum import Enum
from functools import wraps
from flask_jwt_extended import get_jwt
from flask import jsonify

class Role(Enum):
    """User roles with hierarchical permissions"""
    DEVELOPER = 'developer'
    TEAM_LEAD = 'team_lead'
    CLIENT = 'client'
    ADMIN = 'admin'


# Define permissions for each role
ROLE_PERMISSIONS = {
    Role.DEVELOPER.value: [
        'can_view_tasks',
        'can_update_assigned_tasks',
        'can_comment_on_tasks',
        'can_view_github_repos',
        'can_link_github_commits',
    ],
    Role.TEAM_LEAD.value: [
        'can_view_tasks',
        'can_update_assigned_tasks',
        'can_comment_on_tasks',
        'can_view_github_repos',
        'can_link_github_commits',
    ],
    Role.CLIENT.value: [
        'can_view_tasks',
        'can_update_assigned_tasks',
        'can_comment_on_tasks',
        'can_view_github_repos',
        'can_link_github_commits',
    ],
    Role.ADMIN.value: [
        'can_view_tasks',
        'can_create_tasks',
        'can_update_any_task',
        'can_delete_tasks',
        'can_assign_tasks',
        'can_comment_on_tasks',
        'can_view_github_repos',
        'can_link_github_repos',
        'can_link_github_commits',
        'can_view_team_reports',
        'can_manage_users',
        'can_manage_system_settings',
    ]
}


def require_role(role):
    """Decorator to require a specific role"""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            user_role = claims.get('role')
            expected_role = role.value if isinstance(role, Role) else role
            
            if not user_role or user_role != expected_role:
                return jsonify({'message': 'Insufficient role permissions'}), 403
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_permission(permission):
    """Decorator to require a specific permission"""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            user_role = claims.get('role')
            
            if not user_role or permission not in ROLE_PERMISSIONS.get(user_role, []):
                return jsonify({'message': 'Insufficient permissions'}), 403
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator
