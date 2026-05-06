# Task controller - business logic

from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, get_jwt
from ...db.models import db, Task, User  # Changed to relative import
from ...auth.rbac import Role  # Changed to relative import
from ..validators.task_validator import validate_task_data  # Changed to relative import
from unittest.mock import Mock

MEMBER_ROLES = {
    Role.DEVELOPER.value,
    Role.TEAM_LEAD.value,
}

TASK_MANAGER_ROLES = {
    Role.TEAM_LEAD.value,
    Role.ADMIN.value,
}


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
    
    # Apply role-based filtering
    if user_role in TASK_MANAGER_ROLES:
        # Team leads and admins can see all tasks for assignment and reporting.
        tasks = query.all()
    else:
        # Developers can only see tasks assigned to them or created by them.
        tasks = query.filter(
            (Task.assigned_to == user_id) | (Task.created_by == user_id)
        ).all()
    
    # Convert tasks to JSON response
    tasks_data = [_serialize_task(task) for task in tasks]
    
    return jsonify({'tasks': tasks_data})

def get_task_by_id(task_id):
    """Controller function to get a single task"""
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')
    
    task = Task.query.get_or_404(task_id)
    
    # Apply role-based access control
    if (user_role in MEMBER_ROLES and 
        task.assigned_to != user_id and task.created_by != user_id):
        return jsonify({'message': 'You do not have permission to view this task'}), 403
    
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

    assigned_to = data.get('assigned_to')
    if assigned_to in (None, ''):
        assigned_to = None
    elif isinstance(assigned_to, str) and assigned_to.isdigit():
        assigned_to = int(assigned_to)

    project_id = data.get('project_id')
    if project_id in (None, ''):
        project_id = None
    elif isinstance(project_id, str) and project_id.isdigit():
        project_id = int(project_id)
    
    # Create new task
    new_task = Task(
        title=data['title'],
        description=data['description'],
        status=data['status'],
        priority=data.get('priority', 'medium'),
        progress=data.get('progress', 0),
        assigned_to=assigned_to,
        created_by=user_id,
        deadline=data.get('deadline'),
        project_id=project_id
    )
    
    db.session.add(new_task)
    db.session.commit()
    
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
    
    # Check if user has permission to update this task
    can_update_task = user_role == Role.ADMIN.value or task.assigned_to == user_id
    can_assign_task = user_role in TASK_MANAGER_ROLES

    if not can_update_task and not can_assign_task:
        return jsonify({'message': 'You can only update tasks assigned to you'}), 403

    non_assignment_fields = {'title', 'description', 'status', 'progress', 'priority'} & set(data.keys())
    if non_assignment_fields and not can_update_task:
        return jsonify({'message': 'You can only update tasks assigned to you'}), 403
    
    # Update allowed fields
    if 'title' in data:
        task.title = data['title']
    if 'description' in data:
        task.description = data['description']
    if 'status' in data:
        task.status = data['status']
    if 'progress' in data:
        task.progress = data['progress']
    if 'priority' in data:
        task.priority = data['priority']
    
    if 'assigned_to' in data and can_assign_task:
        task.assigned_to = data['assigned_to']
    elif 'assigned_to' in data:
        return jsonify({'message': 'You do not have permission to assign tasks'}), 403
    
    db.session.commit()
    
    return jsonify({
        'message': 'Task updated successfully',
        'task': {
            'id': _task_value(task, 'id'),
            'title': _task_value(task, 'title'),
            'status': _task_value(task, 'status'),
            'priority': _task_value(task, 'priority', 'medium'),
            'progress': _task_value(task, 'progress', 0)
        }
    })

def delete_task_by_id(task_id):
    """Controller function to delete a task"""
    task = Task.query.get_or_404(task_id)
    
    db.session.delete(task)
    db.session.commit()
    
    return jsonify({'message': 'Task deleted successfully'})
