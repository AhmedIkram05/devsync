# Project controller - business logic

from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, get_jwt
from ...db.models import db, Project, Task, User  # Changed to relative import
from ...auth.rbac import Role  # Changed to relative import
from ..validators.project_validator import validate_project_data  # Changed to relative import
import json
import time
import uuid
import traceback


def _debug_log(hypothesis_id, location, message, data, run_id='initial'):
    payload = {
        'sessionId': 'fb26a3',
        'runId': run_id,
        'hypothesisId': hypothesis_id,
        'location': location,
        'message': message,
        'data': data,
        'timestamp': int(time.time() * 1000),
        'id': f"log_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
    }
    try:
        with open('/Users/ahmedikram/GitHub Repos/DevSync/.cursor/debug-fb26a3.log', 'a', encoding='utf-8') as log_file:
            log_file.write(json.dumps(payload) + '\n')
    except Exception:
        pass


def _relationship_items(value):
    if value is None:
        return []
    if hasattr(value, 'all'):
        return value.all()
    return list(value)

def get_all_projects():
    """Controller function to get all projects visible to the user"""
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')
    
    # Apply role-based access control for projects
    if user_role in [Role.ADMIN.value, Role.TEAM_LEAD.value]:
        # Admins and team leads can see all projects
        projects = Project.query.all()
    else:
        # Developers can only see projects they're assigned to
        user = User.query.get(user_id)
        projects = user.projects.all()  # Assuming a many-to-many relationship exists
    
    projects_data = [{
        'id': project.id,
        'name': project.name,
        'description': project.description,
        'status': project.status,
        'github_repo': project.github_repo,
        'created_by': project.created_by,
        'created_at': project.created_at.isoformat() if project.created_at else None,
        'updated_at': project.updated_at.isoformat() if project.updated_at else None
    } for project in projects]
    
    return jsonify({'projects': projects_data})

def get_project_by_id(project_id):
    """Controller function to get a specific project"""
    try:
        user_id = get_jwt_identity()['user_id']
        claims = get_jwt()
        user_role = claims.get('role')
        
        project = Project.query.get_or_404(project_id)
        # region agent log
        _debug_log(
            'H3',
            'projects_controller.py:get_project_by_id:after_project_lookup',
            'Loaded project and claims for access check',
            {
                'project_id': project_id,
                'project_created_by': project.created_by,
                'user_id': user_id,
                'user_role': user_role
            }
        )
        # endregion
        
        # Check if user has access to this project
        if user_role == Role.DEVELOPER.value:
            # Check if developer is assigned to this project
            user = User.query.get(user_id)
            # region agent log
            user_project_ids = [p.id for p in user.projects.all()] if user else []
            _debug_log(
                'H1-H4',
                'projects_controller.py:get_project_by_id:membership_check',
                'Evaluating membership access for developer',
                {
                    'project_id': project_id,
                    'user_id': user_id,
                    'user_role': user_role,
                    'user_project_ids': user_project_ids,
                    'contains_project': project_id in user_project_ids
                }
            )
            # endregion
            if project not in user.projects:
                return jsonify({'message': 'You do not have access to this project'}), 403
        
        # Get project creator's name
        creator = User.query.get(project.created_by)
        creator_name = creator.name if creator else "Unknown"
        
        # Get team members for this project
        team_members = [{
            'id': member.id,
            'name': member.name,
            'role': member.role
        } for member in _relationship_items(project.team_members)]
        
        project_data = {
            'id': project.id,
            'name': project.name,
            'description': project.description,
            'status': project.status,
            'github_repo': project.github_repo,
            'created_by': project.created_by,
            'creator_name': creator_name,
            'team_members': team_members,
            'created_at': project.created_at.isoformat() if project.created_at else None,
            'updated_at': project.updated_at.isoformat() if project.updated_at else None
        }
        
        return jsonify({'project': project_data})
    except Exception as exc:
        # region agent log
        _debug_log(
            'H6',
            'projects_controller.py:get_project_by_id:exception',
            'Unhandled exception in get_project_by_id',
            {
                'project_id': project_id,
                'error_type': type(exc).__name__,
                'error_message': str(exc),
                'traceback': traceback.format_exc()
            }
        )
        # endregion
        raise

def create_project():
    """Controller function to create a new project"""
    data = request.get_json()
    
    # Validate project data
    validation_result = validate_project_data(data)
    if validation_result:
        return validation_result
    
    user_id = get_jwt_identity()['user_id']
    
    # region agent log
    _debug_log(
        'H2',
        'projects_controller.py:create_project:payload',
        'Received project creation payload',
        {
            'user_id': user_id,
            'name': data.get('name'),
            'status': data.get('status'),
            'team_members': data.get('team_members')
        }
    )
    # endregion

    # Create new project
    new_project = Project(
        name=data['name'],
        description=data['description'],
        status=data.get('status', 'active'),
        github_repo=data.get('github_repo'),
        created_by=user_id
    )
    
    db.session.add(new_project)
    
    # Add team members if provided
    if 'team_members' in data and data['team_members']:
        for member_id in data['team_members']:
            member = User.query.get(member_id)
            if member:
                new_project.team_members.append(member)
    
    db.session.commit()
    # region agent log
    _debug_log(
        'H1-H2',
        'projects_controller.py:create_project:post_commit',
        'Project created and memberships persisted',
        {
            'project_id': new_project.id,
            'created_by': user_id,
            'team_member_ids': [member.id for member in _relationship_items(new_project.team_members)]
        }
    )
    # endregion
    
    return jsonify({
        'message': 'Project created successfully',
        'project': {
            'id': new_project.id,
            'name': new_project.name,
            'status': new_project.status
        }
    }), 201

def update_project(project_id):
    """Controller function to update a project"""
    data = request.get_json()
    
    # Validate project data
    validation_result = validate_project_data(data, update=True)
    if validation_result:
        return validation_result
    
    project = Project.query.get_or_404(project_id)
    
    # Update allowed fields
    if 'name' in data:
        project.name = data['name']
    if 'description' in data:
        project.description = data['description']
    if 'status' in data:
        project.status = data['status']
    if 'github_repo' in data:
        project.github_repo = data['github_repo']
    
    # Update team members if provided
    if 'team_members' in data:
        # Clear existing team members
        project.team_members = []
        
        # Add new team members
        for member_id in data['team_members']:
            member = User.query.get(member_id)
            if member:
                project.team_members.append(member)
    
    db.session.commit()
    
    return jsonify({
        'message': 'Project updated successfully',
        'project': {
            'id': project.id,
            'name': project.name,
            'status': project.status
        }
    })

def delete_project(project_id):
    """Controller function to delete a project"""
    project = Project.query.get_or_404(project_id)
    
    db.session.delete(project)
    db.session.commit()
    
    # Updated to return 204
    return '', 204

def get_project_tasks(project_id):
    """Controller function to get all tasks for a project"""
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')
    
    project = Project.query.get_or_404(project_id)
    
    # Check if user has access to this project
    if user_role == Role.DEVELOPER.value:
        # Check if developer is assigned to this project
        user = User.query.get(user_id)
        if project not in user.projects:
            return jsonify({'message': 'You do not have access to this project'}), 403
    
    # Get tasks for this project
    tasks = Task.query.filter_by(project_id=project_id).all()
    
    tasks_data = [{
        'id': task.id,
        'title': task.title,
        'description': task.description,
        'status': task.status,
        'priority': task.priority,
        'progress': task.progress,
        'assigned_to': task.assigned_to,
        'created_by': task.created_by,
        'deadline': task.deadline.isoformat() if task.deadline else None,
        'created_at': task.created_at.isoformat() if task.created_at else None,
        'updated_at': task.updated_at.isoformat() if task.updated_at else None
    } for task in tasks]
    
    return jsonify({'tasks': tasks_data})
