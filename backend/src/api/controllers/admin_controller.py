# Admin controller - business logic for admin-only operations

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity
from sqlalchemy import func

from src.socketio_server import emit_dashboard_refresh

from ...auth.rbac import Role
from ...db.models import Project, Task, User, db
from ...db.transaction import transactional
from ...services import audit_service, settings_service
from ..validators.admin_validator import validate_system_settings, validate_user_role_update


def _grouped_counts(model, column):
    """{value: count} for *column* from one SQL GROUP BY; {} when it fails.

    Counting in SQL replaces loading every row just to ``len()`` it — the same
    aggregate shape the dashboard controller uses.
    """
    try:
        rows = db.session.query(column, func.count(model.id)).group_by(column).all()
    except Exception:
        return {}
    return {(value or "unknown"): count for value, count in rows}


def get_system_stats():
    """Controller function to get system statistics for admin dashboard"""

    user_counts = _grouped_counts(User, User.role)
    project_counts = _grouped_counts(Project, Project.status)
    task_counts = _grouped_counts(Task, Task.status)

    user_stats = {
        "total": sum(user_counts.values()),
        "admins": user_counts.get(Role.ADMIN.value, 0),
        "team_leads": user_counts.get(Role.TEAM_LEAD.value, 0),
        "developers": user_counts.get(Role.DEVELOPER.value, 0),
    }

    project_stats = {
        "total": sum(project_counts.values()),
        "active": project_counts.get("active", 0),
        "completed": project_counts.get("completed", 0),
        "on_hold": project_counts.get("on_hold", 0),
    }

    task_stats = {
        "total": sum(task_counts.values()),
        "todo": task_counts.get("todo", 0),
        "in_progress": task_counts.get("in_progress", 0),
        "review": task_counts.get("review", 0),
        "done": task_counts.get("done", 0) + task_counts.get("completed", 0),
    }

    return jsonify(
        {
            "users": user_stats,
            "projects": project_stats,
            "tasks": task_stats,
        }
    )


def get_system_settings():
    """Controller function to get system settings"""
    settings = settings_service.get_settings()
    return jsonify({"settings": settings})


@transactional
def update_system_settings():
    """Controller function to update system settings"""
    data = request.get_json()

    # Validate settings data
    validation_result = validate_system_settings(data)
    if validation_result:
        return validation_result

    current_user = get_jwt_identity()
    user_id = current_user.get("user_id") if isinstance(current_user, dict) else current_user

    settings_service.update_settings(data, user_id)

    audit_service.record(
        action="settings_updated", resource_type="settings", metadata={"settings_updated": list(data.keys())}
    )
    emit_dashboard_refresh(
        "settings_updated", resource_type="settings", payload={"settings_updated": list(data.keys())}
    )

    return jsonify({"message": "System settings updated successfully", "settings": data})


@transactional
def update_user_role(user_id):
    """Controller function to update a user's role"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({"message": "User not found"}), 404

    data = request.get_json()

    # Validate role data
    validation_result = validate_user_role_update(data)
    if validation_result:
        return validation_result

    if data["role"] != Role.ADMIN.value:
        from .users_controller import _is_last_admin

        if _is_last_admin(user):
            return jsonify({"message": "Cannot demote the last remaining admin"}), 400

    # Update user role
    old_role = user.role
    user.role = data["role"]
    db.session.flush()

    # Role change invalidates existing tokens so stale claims cannot persist.
    from ...auth.token_blocklist import revoke_all_user_tokens

    revoke_all_user_tokens(user.id)

    audit_service.record(
        action="user_role_changed",
        resource_type="user",
        resource_id=user.id,
        metadata={"old_role": old_role, "new_role": user.role},
    )
    emit_dashboard_refresh(
        "user_role_changed",
        resource_type="user",
        resource_id=user.id,
        payload={"old_role": old_role, "new_role": user.role},
    )

    return jsonify(
        {
            "message": "User role updated successfully",
            "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role},
        }
    )
