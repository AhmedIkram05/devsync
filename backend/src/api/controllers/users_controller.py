# User controller - business logic

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity

from src.socketio_server import emit_dashboard_refresh

from ...auth.helpers import hash_password, verify_password
from ...db.models import (
    AuditLog,
    Comment,
    GitHubToken,
    Notification,
    Project,
    Report,
    SystemSetting,
    Task,
    User,
    db,
)
from ...db.models.models import project_members
from ...services import audit_service
from ..validators.user_validator import validate_profile_update, validate_user_data


def _cleanup_user_dependencies(user_id, replacement_user_id):
    """Remove or reassign rows that block hard-deleting a user."""
    db.session.execute(project_members.delete().where(project_members.c.user_id == user_id))
    Task.query.filter(Task.assigned_to == user_id).update(
        {"assigned_to": None},
        synchronize_session=False,
    )
    Task.query.filter(Task.created_by == user_id).update(
        {"created_by": replacement_user_id},
        synchronize_session=False,
    )
    Project.query.filter(Project.created_by == user_id).update(
        {"created_by": replacement_user_id},
        synchronize_session=False,
    )
    Comment.query.filter(Comment.user_id == user_id).delete(synchronize_session=False)
    Notification.query.filter(Notification.user_id == user_id).delete(synchronize_session=False)
    GitHubToken.query.filter(GitHubToken.user_id == user_id).delete(synchronize_session=False)
    Report.query.filter(Report.user_id == user_id).delete(synchronize_session=False)
    AuditLog.query.filter(AuditLog.actor_user_id == user_id).update(
        {"actor_user_id": None},
        synchronize_session=False,
    )
    SystemSetting.query.filter(SystemSetting.updated_by == user_id).update(
        {"updated_by": None},
        synchronize_session=False,
    )


def get_all_users():
    """Controller function to get all users"""
    users = User.query.all()

    users_data = [
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "github_username": user.github_username,
            "avatar": getattr(user, "avatar", None),
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }
        for user in users
    ]

    return jsonify({"users": users_data})


def create_user():
    """Controller function to create a new user (admin only)"""
    data = request.get_json()

    # Validate user data
    validation_result = validate_user_data(data)
    if validation_result:
        return validation_result

    # Check if email is already taken
    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"message": "Email already in use"}), 409

    admin_user_id = get_jwt_identity()["user_id"]

    # Create new user
    new_user = User(
        name=data["name"],
        email=data["email"],
        password=hash_password(data.get("password")),
        role=data.get("role", "developer"),
    )

    db.session.add(new_user)
    db.session.commit()

    audit_service.record(
        action="user_created", resource_type="user", resource_id=new_user.id, metadata={"role": new_user.role}
    )
    emit_dashboard_refresh(
        "user_created", resource_type="user", resource_id=new_user.id, payload={"role": new_user.role}
    )

    # Notify admins about new user
    from ...services.notification_service import NotificationService

    NotificationService.user_crud_notification(
        action_type="user_created",
        affected_user_name=new_user.name,
        affected_user_role=new_user.role,
        admin_user_id=admin_user_id,
    )

    return jsonify(
        {
            "message": "User created successfully",
            "user": {"id": new_user.id, "name": new_user.name, "email": new_user.email, "role": new_user.role},
        }
    ), 201


def get_user_by_id(user_id):
    """Controller function to get a specific user"""
    user = User.query.get_or_404(user_id)

    user_data = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "github_username": user.github_username,
        "avatar": getattr(user, "avatar", None),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

    return jsonify({"user": user_data})


def update_user(user_id):
    """Controller function to update a user (admin only)"""
    data = request.get_json()

    # Validate user data
    validation_result = validate_user_data(data)
    if validation_result:
        return validation_result

    user = User.query.get_or_404(user_id)
    admin_user_id = get_jwt_identity()["user_id"]

    # Track what fields are being changed
    changed_fields = {}

    # Update allowed fields and track changes
    if "name" in data and user.name != data["name"]:
        changed_fields["name"] = (user.name, data["name"])
        user.name = data["name"]
    if "email" in data and user.email != data["email"]:
        # Check if email is already taken by another user
        existing_user = User.query.filter_by(email=data["email"]).first()
        if existing_user and existing_user.id != user_id:
            return jsonify({"message": "Email already in use"}), 409
        changed_fields["email"] = (user.email, data["email"])
        user.email = data["email"]
    if "role" in data and user.role != data["role"]:
        changed_fields["role"] = (user.role, data["role"])
        user.role = data["role"]
    if "password" in data and data["password"]:
        changed_fields["password"] = ("***", "***")
        user.password = hash_password(data["password"])
    if "github_username" in data and user.github_username != data["github_username"]:
        changed_fields["github_username"] = (user.github_username, data["github_username"])
        user.github_username = data["github_username"]
    if "avatar" in data and hasattr(user, "avatar") and user.avatar != data["avatar"]:
        changed_fields["avatar"] = ("...", "...")
        user.avatar = data["avatar"]

    db.session.commit()

    audit_service.record(action="user_updated", resource_type="user", resource_id=user.id, metadata={"role": user.role})
    emit_dashboard_refresh("user_updated", resource_type="user", resource_id=user.id, payload={"role": user.role})

    # Notify admins about user update/role change
    from ...services.notification_service import NotificationService

    if "role" in changed_fields:
        NotificationService.user_crud_notification(
            action_type="user_role_changed",
            affected_user_name=user.name,
            affected_user_role=user.role,
            changed_fields=changed_fields if changed_fields else None,
            admin_user_id=admin_user_id,
        )
    else:
        NotificationService.user_crud_notification(
            action_type="user_updated",
            affected_user_name=user.name,
            changed_fields=changed_fields if changed_fields else None,
            admin_user_id=admin_user_id,
        )

    return jsonify(
        {
            "message": "User updated successfully",
            "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role},
        }
    )


def delete_user(user_id):
    """Controller function to delete a user (admin only)"""
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"message": "User not found"}), 404
    admin_user_id = get_jwt_identity()["user_id"]

    if user.id == admin_user_id:
        return jsonify({"message": "You cannot delete your own account"}), 400

    user_name = user.name

    try:
        _cleanup_user_dependencies(user.id, admin_user_id)
        db.session.delete(user)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"message": "Failed to delete user"}), 500

    audit_service.record(action="user_deleted", resource_type="user", resource_id=user_id)
    emit_dashboard_refresh("user_deleted", resource_type="user", resource_id=user_id)

    # Notify admins about user deletion
    from ...services.notification_service import NotificationService

    NotificationService.user_crud_notification(
        action_type="user_deleted", affected_user_name=user_name, admin_user_id=admin_user_id
    )

    return jsonify({"message": "User deleted successfully"})


def get_current_user_profile():
    """Controller function to get the current user's profile"""
    user_id = get_jwt_identity()["user_id"]
    user = User.query.get_or_404(user_id)

    user_data = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "github_username": user.github_username,
        "avatar": getattr(user, "avatar", None),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

    return jsonify({"user": user_data})


def update_current_user_profile():
    """Controller function to update the current user's profile"""
    data = request.get_json()
    user_id = get_jwt_identity()["user_id"]

    # Validate profile update data
    validation_result = validate_profile_update(data)
    if validation_result:
        return validation_result

    user = User.query.get_or_404(user_id)

    # Update allowed fields
    if "name" in data:
        user.name = data["name"]
    if "email" in data:
        # Check if email is already taken by another user
        existing_user = User.query.filter_by(email=data["email"]).first()
        if existing_user and existing_user.id != user_id:
            return jsonify({"message": "Email already in use"}), 409
        user.email = data["email"]
    if "github_username" in data:
        user.github_username = data["github_username"]
    if "avatar" in data and hasattr(user, "avatar"):
        user.avatar = data["avatar"]
    if "current_password" in data and "new_password" in data:
        # Verify current password
        if not verify_password(data["current_password"], user.password):
            return jsonify({"message": "Current password is incorrect"}), 400
        user.password = hash_password(data["new_password"])

    db.session.commit()

    return jsonify(
        {"message": "Profile updated successfully", "user": {"id": user.id, "name": user.name, "email": user.email}}
    )
