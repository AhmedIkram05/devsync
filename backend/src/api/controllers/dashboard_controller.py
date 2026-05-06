# Dashboard controller - business logic for user dashboards
from flask import jsonify
from flask_jwt_extended import get_jwt_identity, get_jwt
from ...db.models import db, User, Task, Project  # Changed to relative import
from ...auth.rbac import Role  # Changed to relative import
from datetime import datetime, timedelta
import traceback
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

COMPLETED_TASK_STATUSES = {'done', 'completed'}


def _safe_query_all(model):
    try:
        return model.query.all()
    except Exception:
        return []


def _count(items, predicate):
    return sum(1 for item in items if predicate(item))


def _is_completed_status(status):
    return status in COMPLETED_TASK_STATUSES


def _is_completed_task(task):
    return _is_completed_status(getattr(task, 'status', None))

def get_user_tasks(user_id):
    """Helper function to get all tasks for a user"""
    try:
        return Task.query.filter_by(assigned_to=user_id).all()
    except Exception as e:
        logger.error(f"Error fetching user tasks: {str(e)}")
        return []

def get_tasks_due_soon(user_id):
    """Helper function to get tasks due soon for a user"""
    try:
        today = datetime.now().date()
        week_later = today + timedelta(days=7)
        return Task.query.filter_by(assigned_to=user_id)\
            .filter(Task.deadline.isnot(None))\
            .filter(Task.deadline.between(today, week_later))\
            .filter(~Task.status.in_(COMPLETED_TASK_STATUSES)).all()
    except Exception as e:
        logger.error(f"Error fetching tasks due soon: {str(e)}")
        return []

def get_recent_completed_tasks(user_id, timeframe='month'):
    """Helper function to get recent completed tasks for a user, bounding extreme date filters."""
    try:
        today = datetime.now().date()
        days_map = {
            'week': 7,
            'month': 30,
            'quarter': 90,
            'year': 365,
            'century': 36500
        }
        days = days_map.get(timeframe, 30)
        
        # Boundary fallback: default to 30 days if the timeframe exceeds 5 years (e.g. century)
        if days > 1825:
            days = 30

        time_ago = today - timedelta(days=days)
        return Task.query.filter_by(assigned_to=user_id)\
            .filter(
                Task.status.in_(COMPLETED_TASK_STATUSES),
                Task.updated_at >= time_ago,
            ).all()
    except Exception as e:
        logger.error(f"Error fetching completed tasks: {str(e)}")
        return []

def get_project_tasks(project_id):
    """Helper function to get all tasks for a project"""
    try:
        return Task.query.filter_by(project_id=project_id).all()
    except Exception as e:
        logger.error(f"Error fetching project tasks: {str(e)}")
        return []

def get_project_tasks_due_soon(project_id):
    """Helper function to get tasks due soon for a project"""
    try:
        today = datetime.now().date()
        week_later = today + timedelta(days=7)
        return Task.query.filter_by(project_id=project_id)\
            .filter(Task.deadline.isnot(None))\
            .filter(Task.deadline.between(today, week_later))\
            .filter(~Task.status.in_(COMPLETED_TASK_STATUSES)).all()
    except Exception as e:
        logger.error(f"Error fetching project tasks due soon: {str(e)}")
        return []

def get_recent_updated_project_tasks(project_id):
    """Helper function to get recently updated project tasks"""
    try:
        return Task.query.filter_by(project_id=project_id)\
            .order_by(Task.updated_at.desc()).limit(5).all()
    except Exception as e:
        logger.error(f"Error fetching updated project tasks: {str(e)}")
        return []

def get_user_dashboard():
    """Controller function to get dashboard data for the current user"""
    try:
        user_id = get_jwt_identity()['user_id']
        claims = get_jwt()
        user_role = claims.get('role')
        
        # Log the request details for debugging
        logger.info(f"Getting dashboard for user ID: {user_id}, role: {user_role}")
        
        # Get basic user info
        user = User.query.get(user_id)
        if not user:
            logger.error(f"User not found: {user_id}")
            return jsonify({'message': 'User not found'}), 404
        
        # Get assigned tasks
        assigned_tasks = get_user_tasks(user_id)
        
        # Get tasks due soon (within 7 days)
        tasks_due_soon = get_tasks_due_soon(user_id)
        
        # Get recently completed tasks (last 30 days)
        completed_tasks = get_recent_completed_tasks(user_id)
        
        # Get projects user is part of
        user_projects = user.projects.all()  # Assuming a many-to-many relationship exists
        
        # Format response data
        dashboard_data = {
            'user': {
                'id': user.id,
                'name': user.name,
                'role': user.role
            },
            'tasks': {
                'assigned_count': len(assigned_tasks),
                'pending_count': len([t for t in assigned_tasks if not _is_completed_task(t)]),
                'completed_count': len([t for t in assigned_tasks if _is_completed_task(t)]),
                'due_soon': [{
                    'id': task.id,
                    'title': task.title,
                    'deadline': task.deadline.isoformat() if task.deadline else None,
                    'status': task.status,
                    'project_id': task.project_id
                } for task in tasks_due_soon],
                'recently_completed': [{
                    'id': task.id,
                    'title': task.title,
                    'completed_date': task.updated_at.isoformat() if task.updated_at else None,
                    'project_id': task.project_id
                } for task in completed_tasks[:5]]  # Limit to 5 most recent
            },
            'projects': [{
                'id': project.id,
                'name': project.name,
                'status': project.status
            } for project in user_projects]
        }
        
        # Add admin-specific data
        if user_role == Role.ADMIN.value:
            # Get team stats if they're an admin (project manager)
            team_tasks = Task.query.join(Project, Task.project_id == Project.id)\
                .filter(Project.created_by == user_id).all()
            
            dashboard_data['team'] = {
                'total_tasks': len(team_tasks),
                'completed_tasks': len([t for t in team_tasks if _is_completed_task(t)]),
                'in_progress_tasks': len([t for t in team_tasks if t.status == 'in_progress']),
                'pending_tasks': len([t for t in team_tasks if t.status == 'todo'])
            }
        
        return jsonify(dashboard_data)
    except Exception as e:
        # Log the error with traceback
        logger.error(f"Error in get_user_dashboard: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'message': 'An error occurred while loading the dashboard', 'error': str(e)}), 500

def get_client_dashboard():
    """Controller function to get dashboard data for a developer or team lead."""
    try:
        user_id = get_jwt_identity()['user_id']
        claims = get_jwt()
        user_role = claims.get('role')
        
        # Log the request details for debugging
        logger.info(f"Getting member dashboard for user ID: {user_id}, role: {user_role}")
        
        # Get basic user info
        user = User.query.get(user_id)
        if not user:
            logger.error(f"User not found: {user_id}")
            return jsonify({'message': 'User not found'}), 404
        
        # Get tasks assigned to this user
        assigned_tasks = get_user_tasks(user_id)
        
        task_stats = {
            'total':       len(assigned_tasks),
            'todo':        _count(assigned_tasks, lambda task: getattr(task, 'status', None) == 'todo'),
            'in_progress': _count(assigned_tasks, lambda task: getattr(task, 'status', None) == 'in_progress'),
            'review':      _count(assigned_tasks, lambda task: getattr(task, 'status', None) == 'review'),
            'done':        _count(assigned_tasks, lambda task: getattr(task, 'status', None) in {'done', 'completed'}),
        }
        
        # Get tasks due soon
        tasks_due_soon = get_tasks_due_soon(user_id)
        
        # Get projects user is part of
        user_projects = user.projects.all()
        
        # Format response data
        dashboard_data = {
            'tasks': task_stats,
            'tasks_due_soon': [{
                'id': task.id,
                'title': task.title,
                'deadline': task.deadline.isoformat() if task.deadline and hasattr(task.deadline, 'isoformat') else None,
                'status': task.status,
                'project_id': task.project_id
            } for task in tasks_due_soon],
            'projects': [{
                'id': project.id,
                'name': project.name,
                'status': project.status
            } for project in user_projects]
        }
        
        return jsonify(dashboard_data)
    except Exception as e:
        # Log the error with traceback
        logger.error(f"Error in get_client_dashboard: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'message': 'An error occurred while loading the dashboard', 'error': str(e)}), 500

def get_admin_dashboard():
    """Controller function to get admin dashboard data"""
    try:
        user_id = get_jwt_identity()['user_id']
        claims = get_jwt()
        user_role = claims.get('role')
        
        # Check if user is admin
        if user_role != Role.ADMIN.value:
            logger.warning(f"Non-admin user {user_id} attempted to access admin dashboard")
            return jsonify({'message': 'Unauthorized access'}), 403
        
        # Log the request details for debugging
        logger.info(f"Getting admin dashboard for user ID: {user_id}")
        
        # Get basic user info
        user = User.query.get(user_id)
        if not user:
            logger.error(f"User not found: {user_id}")
            return jsonify({'message': 'User not found'}), 404
        
        # Get all tasks (guard against schema mismatches in local DB)
        try:
            all_tasks = Task.query.all()
        except Exception as e:
            logger.error(f"Error querying tasks for admin dashboard (fallback to empty): {str(e)}")
            all_tasks = []
        
        # Get user counts by role
        try:
            users = User.query.all()
        except Exception as e:
            logger.error(f"Error querying users for admin dashboard (fallback to empty): {str(e)}")
            users = []
        user_counts = {
            'total': len(users),
            'admin': len([u for u in users if u.role == Role.ADMIN.value]),
            'team_lead': len([u for u in users if u.role == Role.TEAM_LEAD.value]),
            'developer': len([u for u in users if u.role == Role.DEVELOPER.value]),
        }
        
        # Calculate task statistics
        task_stats = {
            'total': len(all_tasks),
            'backlog': len([t for t in all_tasks if t.status == 'backlog']),
            'todo': len([t for t in all_tasks if t.status == 'todo']),
            'in_progress': len([t for t in all_tasks if t.status == 'in_progress']),
            'review': len([t for t in all_tasks if t.status == 'review']),
            'done': len([t for t in all_tasks if _is_completed_task(t)])
        }
        
        # Format response data
        dashboard_data = {
            'users': user_counts,
            'tasks': task_stats,
            'projects': {
                'total': Project.query.count()
            }
        }
        # Include recent projects (top 3 by updated_at)
        try:
            recent_projects_query = Project.query.order_by(Project.updated_at.desc()).limit(3).all()
            dashboard_data['recentProjects'] = [
                {
                    'id': p.id,
                    'name': p.name,
                    'status': p.status,
                    'created_at': p.created_at.isoformat() if p.created_at else None,
                    'task_count': len(p.tasks) if getattr(p, 'tasks', None) is not None else 0
                }
                for p in recent_projects_query
            ]
        except Exception as e:
            logger.error(f"Error fetching recent projects for admin dashboard: {str(e)}")
            dashboard_data['recentProjects'] = []
        
        return jsonify(dashboard_data)
    except Exception as e:
        # Log the error with traceback
        logger.error(f"Error in get_admin_dashboard: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'message': 'An error occurred while loading the dashboard', 'error': str(e)}), 500

def get_project_dashboard(project_id):
    """Controller function to get dashboard data for a specific project"""
    try:
        # Check if project exists
        project = Project.query.get(project_id)
        if not project:
            return jsonify({'message': 'Project not found'}), 404
        
        # Get all tasks for this project
        tasks = get_project_tasks(project_id)
        
        # Calculate task statistics
        task_stats = {
            'total': len(tasks),
            'todo': len([t for t in tasks if t.status == 'todo']),
            'in_progress': len([t for t in tasks if t.status == 'in_progress']),
            'review': len([t for t in tasks if t.status == 'review']),
            'done': len([t for t in tasks if _is_completed_task(t)])
        }
        
        # Calculate completion percentage
        completion_percentage = 0
        if task_stats['total'] > 0:
            completion_percentage = (task_stats['done'] / task_stats['total']) * 100
        
        # Get tasks due soon (within 7 days)
        tasks_due_soon = get_project_tasks_due_soon(project_id)
        
        # Get recently updated tasks
        recently_updated = get_recent_updated_project_tasks(project_id)
        
        # Get team members
        team_members = project.team_members.all()
        
        dashboard_data = {
            'project': {
                'id': project.id,
                'name': project.name,
                'description': project.description,
                'status': project.status,
                'completion_percentage': completion_percentage
            },
            'task_stats': task_stats,
            'tasks_due_soon': [{
                'id': task.id,
                'title': task.title,
                'deadline': task.deadline.isoformat() if task.deadline and hasattr(task.deadline, 'isoformat') else None,
                'status': task.status,
                'assigned_to': task.assigned_to
            } for task in tasks_due_soon],
            'recently_updated_tasks': [{
                'id': task.id,
                'title': task.title,
                'status': task.status,
                'updated_at': task.updated_at.isoformat() if task.updated_at else None
            } for task in recently_updated],
            'team_members': [{
                'id': member.id,
                'name': member.name,
                'role': member.role
            } for member in team_members]
        }
        
        return jsonify(dashboard_data)
    except Exception as e:
        # Log the error with traceback
        logger.error(f"Error in get_project_dashboard: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'message': 'An error occurred while loading the dashboard', 'error': str(e)}), 500
