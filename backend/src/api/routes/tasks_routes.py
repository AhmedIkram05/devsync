"""Task API routes"""

from flask import request
from flask_jwt_extended import jwt_required
from ..controllers.tasks_controller import (
    get_all_tasks,
    get_task_by_id,
    create_new_task,
    update_task_by_id,
    delete_task_by_id
)
from ..middlewares.validation_middleware import validate_json, validate_params
from ..middlewares import role_required
from ...auth.rbac import Role

AUTHENTICATED_ROLES = [Role.DEVELOPER, Role.TEAM_LEAD, Role.ADMIN]

def register_routes(bp):
    """Register all task routes with the provided Blueprint"""
    
    @bp.route('/tasks', methods=['GET'])
    @jwt_required()
    @role_required(AUTHENTICATED_ROLES)
    def tasks_list():
        """Route to get all tasks based on role and filters"""
        return get_all_tasks()
    
    @bp.route('/tasks', methods=['POST'])
    @jwt_required()
    @role_required([Role.DEVELOPER, Role.TEAM_LEAD, Role.ADMIN])
    @validate_json()
    def create_task():
        """Route to create a new task"""
        return create_new_task()
    
    @bp.route('/tasks/<int:task_id>', methods=['GET'])
    @jwt_required()
    @role_required(AUTHENTICATED_ROLES)
    def get_task(task_id):
        """Route to get a specific task"""
        return get_task_by_id(task_id)
    
    @bp.route('/tasks/<int:task_id>', methods=['PUT'])
    @jwt_required()
    @role_required(AUTHENTICATED_ROLES)
    @validate_json()
    def update_task(task_id):
        """Route to update a task"""
        return update_task_by_id(task_id)
    
    @bp.route('/tasks/<int:task_id>', methods=['DELETE'])
    @jwt_required()
    @role_required([Role.DEVELOPER, Role.TEAM_LEAD, Role.ADMIN])
    def delete_task(task_id):
        """Route to delete a task"""
        return delete_task_by_id(task_id)
