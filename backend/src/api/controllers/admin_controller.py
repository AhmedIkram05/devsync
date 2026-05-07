# Admin controller - business logic for admin-only operations

from flask import jsonify, request
from ...db.models import db, User, Project, Task
from ..validators.admin_validator import validate_system_settings, validate_user_role_update
from ...auth.rbac import Role
from flask_jwt_extended import get_jwt_identity
from ...services import audit_service, settings_service


def _safe_query_all(model):
    try:
        return model.query.all()
    except Exception:
        return []


def _count(items, predicate):
    return sum(1 for item in items if predicate(item))

def get_system_stats():
    """Controller function to get system statistics for admin dashboard"""

    users = _safe_query_all(User)
    projects = _safe_query_all(Project)
    tasks = _safe_query_all(Task)

    user_stats = {
        'total': len(users),
        'admins': _count(users, lambda user: getattr(user, 'role', None) == Role.ADMIN.value),
        'team_leads': _count(users, lambda user: getattr(user, 'role', None) == Role.TEAM_LEAD.value),
        'developers': _count(users, lambda user: getattr(user, 'role', None) == Role.DEVELOPER.value),
    }

    project_stats = {
        'total': len(projects),
        'active': _count(projects, lambda project: getattr(project, 'status', None) == 'active'),
        'completed': _count(projects, lambda project: getattr(project, 'status', None) == 'completed'),
        'on_hold': _count(projects, lambda project: getattr(project, 'status', None) == 'on_hold'),
    }

    task_stats = {
        'total': len(tasks),
        'todo': _count(tasks, lambda task: getattr(task, 'status', None) == 'todo'),
        'in_progress': _count(tasks, lambda task: getattr(task, 'status', None) == 'in_progress'),
        'review': _count(tasks, lambda task: getattr(task, 'status', None) == 'review'),
        'done': _count(tasks, lambda task: getattr(task, 'status', None) in {'done', 'completed'}),
    }

    return jsonify({
        'users': user_stats,
        'projects': project_stats,
        'tasks': task_stats,
    })

def get_system_settings():
    """Controller function to get system settings"""
    settings = settings_service.get_settings()
    return jsonify({'settings': settings})

def update_system_settings():
    """Controller function to update system settings"""
    data = request.get_json()
    
    # Validate settings data
    validation_result = validate_system_settings(data)
    if validation_result:
        return validation_result
    
    current_user = get_jwt_identity()
    user_id = current_user.get('user_id') if isinstance(current_user, dict) else current_user

    settings_service.update_settings(data, user_id)
    
    audit_service.record(
        action='settings_updated',
        resource_type='settings',
        metadata={'settings_updated': list(data.keys())}
    )
    
    return jsonify({
        'message': 'System settings updated successfully',
        'settings': data
    })

def update_user_role(user_id):
    """Controller function to update a user's role"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404
    
    data = request.get_json()
    
    # Validate role data
    validation_result = validate_user_role_update(data)
    if validation_result:
        return validation_result
    
    # Update user role
    old_role = user.role
    user.role = data['role']
    db.session.commit()
    
    audit_service.record(
        action='user_role_changed',
        resource_type='user',
        resource_id=user.id,
        metadata={'old_role': old_role, 'new_role': user.role}
    )
    
    return jsonify({
        'message': 'User role updated successfully',
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'role': user.role
        }
    })
