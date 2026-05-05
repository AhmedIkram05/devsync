# Admin controller - business logic for admin-only operations

from flask import jsonify, request
from ...db.models import db, User, Project, Task
from ..validators.admin_validator import validate_system_settings, validate_user_role_update
from ...auth.rbac import Role
from sqlalchemy import func, case

def get_system_stats():
    """Controller function to get system statistics for admin dashboard"""
    
    # Single query per table instead of loading all rows into memory
    user_stats = db.session.query(
        func.count(User.id).label('total'),
        func.count(case((User.role == Role.ADMIN.value,     1))).label('admins'),
        func.count(case((User.role == Role.TEAM_LEAD.value, 1))).label('team_leads'),
        func.count(case((User.role == Role.DEVELOPER.value, 1))).label('developers'),
    ).one()

    project_stats = db.session.query(
        func.count(Project.id).label('total'),
        func.count(case((Project.status == 'active',    1))).label('active'),
        func.count(case((Project.status == 'completed', 1))).label('completed'),
        func.count(case((Project.status == 'on_hold',   1))).label('on_hold'),
    ).one()

    task_stats = db.session.query(
        func.count(Task.id).label('total'),
        func.count(case((Task.status == 'todo',        1))).label('todo'),
        func.count(case((Task.status == 'in_progress', 1))).label('in_progress'),
        func.count(case((Task.status == 'review',      1))).label('review'),
        # Cover both 'done' and 'completed' in case of mixed data
        func.count(case((Task.status.in_(['done', 'completed']), 1))).label('done'),
    ).one()

    return jsonify({
        'users': {
            'total':      user_stats.total,
            'admins':     user_stats.admins,
            'team_leads': user_stats.team_leads,
            'developers': user_stats.developers,
        },
        'projects': {
            'total':     project_stats.total,
            'active':    project_stats.active,
            'completed': project_stats.completed,
            'on_hold':   project_stats.on_hold,
        },
        'tasks': {
            'total':       task_stats.total,
            'todo':        task_stats.todo,
            'in_progress': task_stats.in_progress,
            'review':      task_stats.review,
            'done':        task_stats.done,  # ← frontend reads tasks.done
        }
    })

def get_system_settings():
    """Controller function to get system settings"""
    # This would typically retrieve settings from a database
    # For now, return placeholder settings
    settings = {
        'app_name': 'DevSync',
        'allow_registration': True,
        'default_user_role': Role.DEVELOPER.value,
        'github_integration_enabled': True,
        'notification_settings': {
            'email_notifications': True,
            'task_assignments': True,
            'project_updates': True
        }
    }
    
    return jsonify({'settings': settings})

def update_system_settings():
    """Controller function to update system settings"""
    data = request.get_json()
    
    # Validate settings data
    validation_result = validate_system_settings(data)
    if validation_result:
        return validation_result
    
    # This would typically update settings in a database
    # For now, just return success response
    
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
    user.role = data['role']
    db.session.commit()
    
    return jsonify({
        'message': 'User role updated successfully',
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'role': user.role
        }
    })
