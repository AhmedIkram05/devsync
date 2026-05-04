# Role-Based Access Control (RBAC) implementation

from enum import Enum
from functools import wraps
from flask_jwt_extended import get_jwt
from flask import jsonify

class Role(Enum):
    """User roles with hierarchical permissions"""
    DEVELOPER = 'developer'
    TEAM_LEAD = 'team_lead'
    ADMIN = 'admin'


DEVELOPER_PERMISSIONS = [
    'can_view_tasks',
    'can_update_assigned_tasks',
    'can_comment',
    'can_comment_on_tasks',
    'can_view_notifications',
    'can_manage_personal_notifications',
    'can_view_own_profile',
    'can_update_own_profile',
    'can_link_github_account',
    'can_view_github_repos',
    'can_link_github_commits',
]

TEAM_LEAD_PERMISSIONS = [
    *DEVELOPER_PERMISSIONS,
    'can_create_tasks',
    'can_assign_tasks',
    'can_view_team_metrics',
    'can_view_team_reports',
    'can_generate_reports',
    'can_view_team_profiles',
]

ADMIN_PERMISSIONS = [
    *TEAM_LEAD_PERMISSIONS,
    'can_update_any_task',
    'can_delete_tasks',
    'can_manage_users',
    'can_manage_system_settings',
    'can_view_audit_logs',
    'can_access_all_data',
    'can_link_github_repos',
]


ROLE_PERMISSIONS = {
    Role.DEVELOPER.value: DEVELOPER_PERMISSIONS,
    Role.TEAM_LEAD.value: TEAM_LEAD_PERMISSIONS,
    Role.ADMIN.value: ADMIN_PERMISSIONS,
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
