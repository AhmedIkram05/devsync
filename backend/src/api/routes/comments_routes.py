"""Comment API routes"""

from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

from ...auth.rbac import Role, _task_visible_to, require_permission, require_project_membership
from ...db.models import Comment, db
from ...services.coercion import to_int
from ..controllers.comments_controller import add_comment, delete_comment, get_task_comments, update_comment
from ..middlewares import role_required
from ..middlewares.validation_middleware import validate_json

AUTHENTICATED_ROLES = [Role.DEVELOPER, Role.TEAM_LEAD, Role.ADMIN]


def require_comment_task_visibility(fn):
    """Gate /comments/<comment_id> by the comment's task project.

    ``require_project_membership`` cannot resolve ``comment_id``, so it falls
    through. Same rule as that gate: admins bypass, everyone else must be able
    to see the comment's task, and a missing or invisible comment is a 404 so
    there is no existence oracle.
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        identity = get_jwt_identity()
        user_id = to_int(identity.get("user_id") if isinstance(identity, dict) else identity)
        if user_id is None:
            return jsonify({"message": "Invalid user identity"}), 401
        if get_jwt().get("role") == Role.ADMIN.value:
            return fn(*args, **kwargs)

        comment = db.session.get(Comment, to_int(kwargs.get("comment_id")))
        task = getattr(comment, "task", None)
        if task is None or not _task_visible_to(task, user_id):
            return jsonify({"message": "Comment not found"}), 404
        return fn(*args, **kwargs)

    return wrapper


def register_routes(bp):
    """Register all comment routes with the provided Blueprint"""

    @bp.route("/tasks/<int:task_id>/comments", methods=["GET"])
    @jwt_required()
    @role_required(AUTHENTICATED_ROLES)
    @require_project_membership
    def comments_list(task_id):
        """Route to get all comments for a task"""
        return get_task_comments(task_id)

    @bp.route("/tasks/<int:task_id>/comments", methods=["POST"])
    @jwt_required()
    @role_required(AUTHENTICATED_ROLES)
    @require_permission("can_comment_on_tasks")
    @require_project_membership
    @validate_json()
    def create_comment(task_id):
        """Route to add a comment to a task"""
        return add_comment(task_id)

    @bp.route("/comments/<int:comment_id>", methods=["PUT"])
    @jwt_required()
    @role_required(AUTHENTICATED_ROLES)
    @require_comment_task_visibility
    @validate_json()
    def update_comment_route(comment_id):
        """Route to update a comment"""
        return update_comment(comment_id)

    @bp.route("/comments/<int:comment_id>", methods=["DELETE"])
    @jwt_required()
    @role_required(AUTHENTICATED_ROLES)
    @require_comment_task_visibility
    def delete_comment_route(comment_id):
        """Route to delete a comment"""
        return delete_comment(comment_id)
