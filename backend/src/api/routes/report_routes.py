"""Report API routes"""

from flask import request
from flask_jwt_extended import jwt_required
from ..controllers.report_controller import (
    save_report,
    get_reports,
    get_report_by_id,
    delete_report
)
from ..middlewares.validation_middleware import validate_json
from ..middlewares import role_required
from ..middlewares.api_usage_logger import log_api_usage
from ..middlewares.request_logger import log_request
from ...auth.rbac import Role

# Only Team Lead and Admin can generate and view reports
REPORT_ROLES = [Role.TEAM_LEAD, Role.ADMIN]
AUTHENTICATED_ROLES = [Role.DEVELOPER, Role.TEAM_LEAD, Role.ADMIN]

def register_routes(bp):
    """Register all report routes with the provided Blueprint"""
    
    @bp.route('/reports', methods=['POST'])
    @jwt_required()
    @role_required(REPORT_ROLES)
    @validate_json()
    @log_api_usage()
    @log_request()
    def save_report_route():
        """Route to save a generated report"""
        return save_report()
    
    @bp.route('/reports', methods=['GET'])
    @jwt_required()
    @role_required(REPORT_ROLES)
    @log_api_usage()
    @log_request()
    def get_reports_route():
        """Route to get saved reports"""
        return get_reports()
    
    @bp.route('/reports/<int:report_id>', methods=['GET'])
    @jwt_required()
    @role_required(REPORT_ROLES)
    @log_api_usage()
    @log_request()
    def get_report_route(report_id):
        """Route to get a specific report"""
        return get_report_by_id(report_id)
    
    @bp.route('/reports/<int:report_id>', methods=['DELETE'])
    @jwt_required()
    @role_required(REPORT_ROLES)
    @log_api_usage()
    @log_request()
    def delete_report_route(report_id):
        """Route to delete a report"""
        return delete_report(report_id)
