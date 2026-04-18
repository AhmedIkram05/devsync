# Project controller - business logic

from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, get_jwt
from ...db.models import db, Project, Task, User  # Changed to relative import
from ...auth.rbac import Role  # Changed to relative import
from ..validators.project_validator import validate_project_data  # Changed to relative import

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
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')
    
    project = Project.query.get_or_404(project_id)
    
    # Check if user has access to this project
    if user_role in [Role.DEVELOPER.value, Role.CLIENT.value]:
        # Check if developer is assigned to this project
        user = User.query.get(user_id)
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
    } for member in project.team_members.all()]
    
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

def create_project():
    """Controller function to create a new project"""
    data = request.get_json()
    
    # Validate project data
    validation_result = validate_project_data(data)
    if validation_result:
        return validation_result
    
    user_id = get_jwt_identity()['user_id']
    
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
    if user_role in [Role.DEVELOPER.value, Role.CLIENT.value]:
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
        'progress': task.progress,
        'assigned_to': task.assigned_to,
        'created_by': task.created_by,
        'deadline': task.deadline.isoformat() if task.deadline else None,
        'created_at': task.created_at.isoformat() if task.created_at else None,
        'updated_at': task.updated_at.isoformat() if task.updated_at else None
    } for task in tasks]
    
    return jsonify({'tasks': tasks_data})
