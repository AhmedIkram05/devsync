"""Project API routes"""

from flask_jwt_extended import jwt_required

from ...auth.rbac import Role
from ..controllers.projects_controller import (
    create_project,
    delete_project,
    get_all_projects,
    get_project_by_id,
    get_project_tasks,
    update_project,
)
from ..middlewares import role_required
from ..middlewares.api_usage_logger import log_api_usage
from ..middlewares.request_logger import log_request
from ..middlewares.validation_middleware import validate_json

AUTHENTICATED_ROLES = [Role.DEVELOPER, Role.TEAM_LEAD, Role.ADMIN]

def register_routes(bp):
    """Register all project routes with the provided Blueprint"""

    @bp.route('/projects', methods=['GET'])
    @jwt_required()
    @role_required(AUTHENTICATED_ROLES)
    @log_api_usage()
    @log_request()
    def projects_list():
        """Route to get all projects visible to user"""
        return get_all_projects()

    @bp.route('/projects', methods=['POST'])
    @jwt_required()
    @role_required([Role.TEAM_LEAD, Role.ADMIN])
    @validate_json()
    @log_api_usage()
    @log_request()
    def create_project_route():
        """Route to create a new project"""
        return create_project()

    @bp.route('/projects/<int:project_id>', methods=['GET'])
    @jwt_required()
    @role_required(AUTHENTICATED_ROLES)
    @log_api_usage()
    def get_project(project_id):
        """Route to get a specific project"""
        return get_project_by_id(project_id)

    @bp.route('/projects/<int:project_id>', methods=['PUT'])
    @jwt_required()
    @role_required([Role.TEAM_LEAD, Role.ADMIN])
    @validate_json()
    @log_api_usage()
    def update_project_route(project_id):
        """Route to update a project"""
        return update_project(project_id)

    @bp.route('/projects/<int:project_id>', methods=['DELETE'])
    @jwt_required()
    @role_required([Role.TEAM_LEAD, Role.ADMIN])
    @log_api_usage()
    def delete_project_route(project_id):
        """Route to delete a project"""
        return delete_project(project_id)

    @bp.route('/projects/<int:project_id>/tasks', methods=['GET'])
    @jwt_required()
    @role_required(AUTHENTICATED_ROLES)
    @log_api_usage()
    def project_tasks(project_id):
        """Route to get all tasks for a project"""
        return get_project_tasks(project_id)
