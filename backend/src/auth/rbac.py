# Role-Based Access Control (RBAC) implementation

from enum import Enum
from functools import wraps
from flask_jwt_extended import get_jwt, get_jwt_identity
from flask import jsonify

class Role(Enum):
    """User roles with hierarchical permissions"""
    DEVELOPER = 'developer'
    TEAM_LEAD = 'team_lead'
    ADMIN = 'admin'


DEVELOPER_PERMISSIONS = [
    'can_view_tasks',
    'can_update_assigned_tasks',
    'can_comment_on_tasks',
    'can_view_notifications',
    'can_manage_personal_notifications',
    'can_view_own_profile',
    'can_update_own_profile',
    'can_link_github_account',
]

TEAM_LEAD_PERMISSIONS = [
    *DEVELOPER_PERMISSIONS,
    'can_create_tasks',
    'can_assign_tasks',
    'can_update_any_task',
    'can_view_all_users',
    'can_view_system_stats',
    'can_generate_reports',
]

ADMIN_PERMISSIONS = [
    *TEAM_LEAD_PERMISSIONS,
    'can_manage_users',
    'can_manage_projects',
    'can_manage_system_settings',
    'can_view_audit_logs',
    'can_link_github_repos',
]


ROLE_PERMISSIONS = {
    Role.DEVELOPER.value: DEVELOPER_PERMISSIONS,
    Role.TEAM_LEAD.value: TEAM_LEAD_PERMISSIONS,
    Role.ADMIN.value: ADMIN_PERMISSIONS,
}


# ---------------------------------------------------------------------------
# Role hierarchy – higher value = more privileged
# ---------------------------------------------------------------------------
ROLE_HIERARCHY = {
    Role.DEVELOPER: 0,
    Role.TEAM_LEAD: 1,
    Role.ADMIN: 2,
}


def _role_level(role_value):
    """Return the numeric hierarchy level for a role string value."""
    for role_enum, level in ROLE_HIERARCHY.items():
        if role_enum.value == role_value:
            return level
    return -1


def has_permission(role_value, permission):
    """Check whether *role_value* (a string such as 'admin') grants *permission*."""
    return permission in ROLE_PERMISSIONS.get(role_value, [])


# ---------------------------------------------------------------------------
# Decorators
# ---------------------------------------------------------------------------

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


def role_at_least(min_role):
    """Decorator that requires the caller's role to be *min_role* or higher.

    Example::

        @role_at_least(Role.TEAM_LEAD)
        def some_view(): ...
    """
    min_role_enum = min_role if isinstance(min_role, Role) else Role(min_role)
    min_level = ROLE_HIERARCHY[min_role_enum]

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            user_role = claims.get('role')
            if not user_role or _role_level(user_role) < min_level:
                return jsonify({'message': 'Insufficient permissions'}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
