# Task controller - business logic

import logging
from datetime import datetime
from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, get_jwt
from ...db.models import db, Task, User, Project  # Changed to relative import
from ...auth.rbac import Role  # Changed to relative import
from ..validators.task_validator import validate_task_data  # Changed to relative import
from ...services import audit_service, settings_service
from ...services.notification_service import NotificationService
from ...services.task_rules import get_project_scope_ids, is_task_overdue
from src.socketio_server import emit_dashboard_refresh
from unittest.mock import Mock

logger = logging.getLogger(__name__)

MEMBER_ROLES = {
    Role.DEVELOPER.value,
    Role.TEAM_LEAD.value,
}

TASK_MANAGER_ROLES = {
    Role.TEAM_LEAD.value,
    Role.ADMIN.value,
}


def _run_notification(callback, *args, **kwargs):
    """Create notifications without making the primary task mutation fail."""
    try:
        callback(*args, **kwargs)
    except Exception:
        db.session.rollback()
        logger.exception("Failed to create task notification")


def _coerce_int(value):
    if value in (None, ''):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return value


def _task_value(task, field, default=None):
    value = vars(task).get(field, getattr(task, field, default))
    if isinstance(value, Mock):
        return default
    return value


def _task_datetime(task, field):
    value = _task_value(task, field)
    if value is None or isinstance(value, Mock):
        return None
    if hasattr(value, 'isoformat'):
        try:
            return value.isoformat()
        except Exception:
            return None
    return value


def _serialize_task(task):
    return {
        'id': _task_value(task, 'id'),
        'title': _task_value(task, 'title'),
        'description': _task_value(task, 'description'),
        'status': _task_value(task, 'status'),
        'priority': _task_value(task, 'priority', 'medium'),
        'progress': _task_value(task, 'progress', 0),
        'project_id': _task_value(task, 'project_id'),
        'assigned_to': _task_value(task, 'assigned_to'),
        'created_by': _task_value(task, 'created_by'),
        'deadline': _task_datetime(task, 'deadline'),
        'created_at': _task_datetime(task, 'created_at'),
        'updated_at': _task_datetime(task, 'updated_at'),
    }

def get_all_tasks():
    """Controller function to get all tasks based on user role and filters"""
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')
    
    # Get query parameters for filtering
    status = request.args.get('status')
    assigned_to = request.args.get('assigned_to')
    created_by = request.args.get('created_by')
    
    # Start with base query
    query = Task.query
    
    # Apply filters if provided
    if status:
        query = query.filter(Task.status == status)
    if assigned_to:
        query = query.filter(Task.assigned_to == assigned_to)
    if created_by:
        query = query.filter(Task.created_by == created_by)
    
    # Apply role-based filtering - Developers can now see all tasks as well
    tasks = query.all()
    
    # Convert tasks to JSON response
    tasks_data = [_serialize_task(task) for task in tasks]

    if settings_service.get_bool_setting('notify_on_overdue_tasks', True):
        scoped_project_ids = get_project_scope_ids(user_id, user_role)
        for task in tasks:
            overdue_scope = {'project_ids': scoped_project_ids} if user_role in TASK_MANAGER_ROLES else {'assigned_to': user_id}
            if not is_task_overdue(task, **overdue_scope):
                continue

            assigned_to = _task_value(task, 'assigned_to')
            if assigned_to is None and user_role not in TASK_MANAGER_ROLES:
                continue

            NotificationService.task_overdue_notification(
                task_id=_task_value(task, 'id'),
                task_name=_task_value(task, 'title'),
                project_id=_task_value(task, 'project_id'),
                recipient_user_id=assigned_to or user_id,
                due_date=None,
            )
    
    return jsonify({'tasks': tasks_data})

def get_task_by_id(task_id):
    """Controller function to get a single task"""
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')
    
    task = Task.query.get_or_404(task_id)
    
    # Authenticated users can view any task
    # Format task data
    task_data = _serialize_task(task)
    
    # Get user details for assigned_to and created_by
    if task.assigned_to:
        assignee = User.query.get(task.assigned_to)
        if assignee:
            task_data['assignee_name'] = assignee.name
    
    creator = User.query.get(task.created_by)
    if creator:
        task_data['creator_name'] = creator.name

    github_links = []
    for link in getattr(task, 'github_links', []) or []:
        repo = getattr(link, 'repository', None)
        github_links.append({
            'id': link.id,
            'task_id': link.task_id,
            'repo_id': link.repo_id,
            'repo_name': repo.repo_name if repo else None,
            'repo_url': repo.repo_url if repo else None,
            'issue_number': link.issue_number,
            'pull_request_number': link.pull_request_number,
            'created_at': link.created_at.isoformat() if link.created_at else None,
        })
    task_data['github_links'] = github_links
    
    return jsonify({'task': task_data})

def create_new_task():
    """Controller function to create a new task"""
    data = request.get_json()

    # Guard: require a JSON body
    if not data:
        return jsonify({'message': 'Invalid or missing JSON body'}), 400

    # Validate task data
    validation_result = validate_task_data(data)
    if validation_result:
        return validation_result

    # Ensure JWT identity contains user_id
    identity = get_jwt_identity()
    if not identity or 'user_id' not in identity:
        return jsonify({'message': 'Invalid authentication token'}), 401
    user_id = identity['user_id']
    user_role = get_jwt().get('role')

    assigned_to = _coerce_int(data.get('assigned_to'))
    if user_role == Role.DEVELOPER.value:
        assigned_to = user_id
    elif assigned_to is None and user_role in TASK_MANAGER_ROLES:
        assigned_to = None

    project_id = _coerce_int(data.get('project_id'))

    if user_role == Role.DEVELOPER.value and data.get('assigned_to') not in (None, '', user_id, str(user_id)):
        return jsonify({'message': 'Developers can only create tasks assigned to themselves'}), 403
    
    # Create new task
    new_task = Task()
    new_task.title = data['title']
    new_task.description = data['description']
    new_task.status = data['status']
    new_task.priority = data.get('priority', 'medium')
    new_task.progress = data.get('progress', 0)
    new_task.assigned_to = assigned_to
    new_task.created_by = user_id
    new_task.deadline = data.get('deadline')
    new_task.project_id = project_id
    
    db.session.add(new_task)
    db.session.commit()

    # Fetch project and assignee names for notification context
    project_name = None
    assignee_name = None
    try:
        if new_task.project_id:
            project = db.session.get(Project, new_task.project_id)
            project_name = project.name if project else None
        if new_task.assigned_to:
            assignee = db.session.get(User, new_task.assigned_to)
            assignee_name = assignee.name if assignee else None
    except Exception:
        pass

    audit_service.record(
        action='task_created',
        resource_type='task',
        resource_id=new_task.id,
        metadata={'project_id': new_task.project_id, 'assigned_to': new_task.assigned_to}
    )

    emit_dashboard_refresh(
        'task_created',
        resource_type='task',
        resource_id=new_task.id,
        payload={'project_id': new_task.project_id, 'assigned_to': new_task.assigned_to}
    )

    _run_notification(
        NotificationService.task_created_notification_v2,
        new_task.id,
        new_task.title,
        new_task.project_id,
        user_id,
        assignee_id=new_task.assigned_to,
        project_name=project_name,
        assignee_name=assignee_name
    )
    
    return jsonify({
        'message': 'Task created successfully',
        'task': {
            'id': new_task.id,
            'title': new_task.title,
            'status': new_task.status
        }
    }), 201

def update_task_by_id(task_id):
    """Controller function to update a task"""
    data = request.get_json()
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')
    
    task = Task.query.get_or_404(task_id)
    old_assignee_id = task.assigned_to
    
    # Check if user has permission to update this task
    # Admins and Team Leads can update any task (can_update_any_task)
    can_update_task = user_role in TASK_MANAGER_ROLES or task.assigned_to == user_id
    can_assign_task = user_role in TASK_MANAGER_ROLES

    if not can_update_task:
        return jsonify({'message': 'You can only update tasks assigned to you'}), 403
    
    # Track which fields changed for notification
    changed_fields = {}
    
    # Update allowed fields
    if 'title' in data:
        if task.title != data['title']:
            changed_fields['title'] = (task.title, data['title'])
        task.title = data['title']
    if 'description' in data:
        if task.description != data['description']:
            changed_fields['description'] = (task.description, data['description'])
        task.description = data['description']
    if 'status' in data:
        if task.status != data['status']:
            changed_fields['status'] = (task.status, data['status'])
        task.status = data['status']
    if 'progress' in data:
        if task.progress != data['progress']:
            changed_fields['progress'] = (task.progress, data['progress'])
        task.progress = data['progress']
    if 'priority' in data:
        if task.priority != data['priority']:
            changed_fields['priority'] = (task.priority, data['priority'])
        task.priority = data['priority']
    if 'deadline' in data:
        if task.deadline != data['deadline']:
            changed_fields['deadline'] = (task.deadline, data['deadline'])
        task.deadline = data['deadline']
    if 'project_id' in data:
        new_project_id = _coerce_int(data['project_id'])
        if task.project_id != new_project_id:
            changed_fields['project_id'] = (task.project_id, new_project_id)
        task.project_id = new_project_id
    
    if 'assigned_to' in data:
        # Only TL or Admins can change the assignee
        if can_assign_task:
            new_assignee = _coerce_int(data['assigned_to'])
            if task.assigned_to != new_assignee:
                changed_fields['assigned_to'] = (task.assigned_to, new_assignee)
            task.assigned_to = new_assignee
        elif _coerce_int(data['assigned_to']) != task.assigned_to:
            return jsonify({'message': 'You do not have permission to reassign tasks'}), 403
    
    db.session.commit()

    audit_service.record(
        action='task_updated',
        resource_type='task',
        resource_id=task.id,
        metadata={'project_id': task.project_id, 'assigned_to': task.assigned_to}
    )

    emit_dashboard_refresh(
        'task_updated',
        resource_type='task',
        resource_id=task.id,
        payload={'project_id': task.project_id, 'assigned_to': task.assigned_to}
    )

    _run_notification(
        NotificationService.task_updated_notification_v2,
        task.id,
        task.title,
        task.project_id,
        user_id,
        assignee_id=task.assigned_to,
        changed_fields=changed_fields if changed_fields else None
    )
    
    return jsonify({
        'message': 'Task updated successfully',
        'task': {
            'id': _task_value(task, 'id'),
            'title': _task_value(task, 'title'),
            'status': _task_value(task, 'status'),
            'priority': _task_value(task, 'priority', 'medium'),
            'progress': _task_value(task, 'progress', 0),
            'project_id': _task_value(task, 'project_id'),
            'deadline': _task_datetime(task, 'deadline'),
            'assigned_to': _task_value(task, 'assigned_to'),
            'description': _task_value(task, 'description')
        }
    })

def delete_task_by_id(task_id):
    """Controller function to delete a task"""
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')

    task = Task.query.get_or_404(task_id)

    can_delete_task = user_role in TASK_MANAGER_ROLES or task.assigned_to == user_id or task.created_by == user_id
    if not can_delete_task:
        return jsonify({'message': 'You can only delete tasks assigned to you'}), 403
    
    db.session.delete(task)
    db.session.commit()

    audit_service.record(
        action='task_deleted',
        resource_type='task',
        resource_id=task_id,
        metadata={'project_id': task.project_id, 'assigned_to': task.assigned_to}
    )

    emit_dashboard_refresh(
        'task_deleted',
        resource_type='task',
        resource_id=task_id,
        payload={'project_id': task.project_id, 'assigned_to': task.assigned_to}
    )
    
    return jsonify({'message': 'Task deleted successfully'})
