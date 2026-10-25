# Notification controller - business logic

from datetime import UTC, datetime

from flask import jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity

from ...auth.rbac import Role, get_user_project_ids
from ...db.models import Notification, db  # Changed to relative import
from ...db.transaction import transactional
from ...services import audit_service
from ...services.notification_service import NotificationService
from ..query_params import get_pagination_args, paginate
from ..validators.notification_validator import validate_notification_data  # Changed to relative import


def get_user_notifications():
    """Controller function to get all notifications for the current user"""
    user_id = get_jwt_identity()["user_id"]

    # Get notifications for this user, order by created_at desc (newest first)
    page, per_page = get_pagination_args()
    query = Notification.query.filter_by(user_id=user_id).order_by(Notification.created_at.desc())
    notifications, pagination = paginate(query, page, per_page)

    notifications_data = [notification.to_dict() for notification in notifications]

    # Total unread for the user, independent of the current page.
    unread_count = Notification.query.filter_by(user_id=user_id, is_read=False).count()

    return jsonify({"notifications": notifications_data, "unread_count": unread_count, "pagination": pagination})


@transactional
def create_notification():
    """Controller function to create a notification"""
    data = request.get_json()

    # Validate notification data
    validation_result = validate_notification_data(data)
    if validation_result:
        return validation_result

    identity = get_jwt_identity()
    jwt_user_id = identity.get("user_id") if isinstance(identity, dict) else identity
    try:
        jwt_user_id = int(jwt_user_id)
    except (TypeError, ValueError):
        return jsonify({"message": "Invalid user identity"}), 401

    # Forgery guard: only team leads and admins may target another user;
    # everyone else notifies themselves regardless of the payload. TLs may
    # only target users who share a project with them — arbitrary targeting
    # would let a TL push arbitrary title/message text (a phishing channel
    # into the browser-notification popup) at anyone in the system.
    target_user_id = data.get("user_id", jwt_user_id)
    try:
        target_user_id = int(target_user_id)
    except (TypeError, ValueError):
        return jsonify({"message": "User ID must be an integer"}), 400
    role = get_jwt().get("role")
    if role not in (Role.TEAM_LEAD.value, Role.ADMIN.value):
        target_user_id = jwt_user_id
    elif role == Role.TEAM_LEAD.value and target_user_id != jwt_user_id:
        shared_projects = get_user_project_ids(jwt_user_id) & get_user_project_ids(target_user_id)
        if not shared_projects:
            return jsonify({"message": "You can only notify users who share a project with you"}), 403

    message = data.get("message") or data.get("content")
    title = data.get("title") or message[:80]
    notification_type = data.get("notification_type") or data.get("type") or "general"
    task_id = data.get("task_id")
    reference_id = data.get("reference_id") or task_id

    # Create new notification and emit it when the target user is connected.
    new_notification = NotificationService.send_to_user(
        user_id=target_user_id,
        notification_type=notification_type,
        title=title,
        message=message,
        reference_id=reference_id,
        task_id=task_id,
    )

    if data.get("is_read") and new_notification:
        new_notification.is_read = True
        new_notification.read_at = datetime.now(UTC)
        db.session.flush()

    if new_notification is not None:
        audit_service.record(
            action="notification_created",
            resource_type="notification",
            resource_id=new_notification.id,
            metadata={"target_user_id": target_user_id},
        )

    return jsonify({"message": "Notification created successfully", "notification": new_notification.to_dict()}), 201


@transactional
def mark_notification_read(notification_id):
    """Controller function to mark a notification as read"""
    user_id = get_jwt_identity()["user_id"]

    # Find notification
    notification = Notification.query.get_or_404(notification_id)

    # Check if notification belongs to user
    if notification.user_id != user_id:
        return jsonify({"message": "Notification not found"}), 404

    # Mark as read
    notification.is_read = True
    notification.read_at = datetime.now(UTC)
    db.session.flush()

    audit_service.record(
        action="notification_read",
        resource_type="notification",
        resource_id=notification_id,
    )

    return jsonify({"message": "Notification marked as read"})


@transactional
def mark_all_notifications_read():
    """Controller function to mark all notifications as read for the current user"""
    user_id = get_jwt_identity()["user_id"]
    now = datetime.now(UTC)

    # Update all unread notifications for this user
    Notification.query.filter_by(user_id=user_id, is_read=False).update(
        {Notification.is_read: True, Notification.read_at: now}
    )

    db.session.flush()

    audit_service.record(
        action="notifications_all_read",
        resource_type="notification",
        resource_id=None,
    )

    return jsonify({"message": "All notifications marked as read"})


@transactional
def delete_notification(notification_id):
    """Controller function to delete a notification"""
    user_id = get_jwt_identity()["user_id"]

    # Find notification
    notification = Notification.query.get_or_404(notification_id)

    # Check if notification belongs to user
    if notification.user_id != user_id:
        return jsonify({"message": "Notification not found"}), 404

    # Delete notification
    db.session.delete(notification)
    db.session.flush()

    audit_service.record(
        action="notification_deleted",
        resource_type="notification",
        resource_id=notification_id,
    )

    return jsonify({"message": "Notification deleted"})
