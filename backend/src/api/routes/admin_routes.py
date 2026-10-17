"""Admin API routes"""

from flask import current_app, jsonify, request
from flask_jwt_extended import jwt_required

from ...auth.rbac import Role, require_permission, role_at_least
from ...services import settings_service
from ..controllers.admin_controller import (
    get_system_settings,
    get_system_stats,
    update_system_settings,
    update_user_role,
)
from ..controllers.audit_controller import cleanup_audit_logs
from ..controllers.users_controller import create_user, delete_user, get_all_users, update_user
from ..middlewares import admin_required
from ..middlewares.rate_limiter import rate_limit
from ..middlewares.validation_middleware import validate_json


def register_routes(bp):
    """Register all admin routes with the provided Blueprint"""

    @bp.route("/admin/users", methods=["POST"])
    @jwt_required()
    @admin_required()
    @validate_json()
    def admin_create_user():
        """Route to create a user"""
        return create_user()

    @bp.route("/admin/stats", methods=["GET"])
    @jwt_required()
    @require_permission("can_view_system_stats")
    @rate_limit(requests_per_window=20, window_seconds=60)
    def system_stats():
        """Route to get system statistics"""
        return get_system_stats()

    @bp.route("/admin/settings", methods=["GET"])
    @jwt_required()
    @admin_required()
    @rate_limit(requests_per_window=20, window_seconds=60)
    def system_settings():
        """Route to get system settings"""
        return get_system_settings()

    @bp.route("/admin/audit-logs/cleanup", methods=["POST"])
    @jwt_required()
    @admin_required()
    @rate_limit(requests_per_window=5, window_seconds=60)
    def audit_logs_cleanup():
        """Route to purge expired audit logs"""
        return cleanup_audit_logs()

    @bp.route("/admin/settings/retention/run", methods=["POST"])
    @jwt_required()
    @admin_required()
    @rate_limit(requests_per_window=5, window_seconds=60)
    def run_retention_cleanup():
        """Route to run all retention cleanups immediately"""
        # Equivalent dry-run entry point offline: python -m src.db.scripts.run_maintenance --dry-run
        dry_run = request.args.get("dry_run", "").strip().lower() in {"true", "1", "yes", "on"}
        try:
            result = settings_service.run_retention_cleanup(dry_run=dry_run)
            return jsonify(
                {
                    "message": "Retention cleanup completed",
                    "result": result,
                    "dry_run": dry_run,
                }
            ), 200
        except Exception:
            current_app.logger.error("Retention cleanup failed", exc_info=True)
            return jsonify(
                {
                    "status": "error",
                    "message": "Retention cleanup failed",
                    "result": None,
                    "dry_run": dry_run,
                }
            ), 500

    @bp.route("/admin/settings", methods=["PUT"])
    @jwt_required()
    @admin_required()
    @validate_json()
    @rate_limit(requests_per_window=10, window_seconds=60)
    def update_settings():
        """Route to update system settings"""
        return update_system_settings()

    @bp.route("/admin/users/<int:user_id>/role", methods=["PUT"])
    @jwt_required()
    @admin_required()
    @validate_json()
    @rate_limit(requests_per_window=10, window_seconds=60)
    def user_role_update(user_id):
        """Route to update a user's role"""
        return update_user_role(user_id)

    @bp.route("/admin/users", methods=["GET"])
    @jwt_required()
    @role_at_least(Role.TEAM_LEAD)
    def admin_get_all_users():
        """Route to get all users"""
        return get_all_users()

    @bp.route("/admin/users/<int:user_id>", methods=["PUT"])
    @jwt_required()
    @admin_required()
    @validate_json()
    def admin_update_user(user_id):
        """Route to update a user"""
        return update_user(user_id)

    @bp.route("/admin/users/<int:user_id>", methods=["DELETE"])
    @jwt_required()
    @admin_required()
    def admin_delete_user(user_id):
        """Route to delete a user"""
        return delete_user(user_id)
