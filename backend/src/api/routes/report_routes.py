"""Report API routes"""

from flask_jwt_extended import jwt_required

from ...auth.rbac import require_permission
from ..controllers.report_controller import delete_report, get_report_by_id, get_reports, save_report
from ..middlewares.api_usage_logger import log_api_usage
from ..middlewares.request_logger import log_request
from ..middlewares.validation_middleware import validate_json


def register_routes(bp):
    """Register all report routes with the provided Blueprint"""

    @bp.route("/reports", methods=["POST"])
    @jwt_required()
    @require_permission("can_generate_reports")
    @validate_json()
    @log_api_usage()
    @log_request()
    def save_report_route():
        """Route to save a generated report"""
        return save_report()

    @bp.route("/reports", methods=["GET"])
    @jwt_required()
    @require_permission("can_generate_reports")
    @log_api_usage()
    @log_request()
    def get_reports_route():
        """Route to get saved reports"""
        return get_reports()

    @bp.route("/reports/<int:report_id>", methods=["GET"])
    @jwt_required()
    @require_permission("can_generate_reports")
    @log_api_usage()
    @log_request()
    def get_report_route(report_id):
        """Route to get a specific report"""
        return get_report_by_id(report_id)

    @bp.route("/reports/<int:report_id>", methods=["DELETE"])
    @jwt_required()
    @require_permission("can_generate_reports")
    @log_api_usage()
    @log_request()
    def delete_report_route(report_id):
        """Route to delete a report"""
        return delete_report(report_id)
