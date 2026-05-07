# Notification controller - business logic

from datetime import datetime, timezone
from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity
from ...db.models import db, Notification  # Changed to relative import
from ..validators.notification_validator import validate_notification_data  # Changed to relative import
from ...services.notification_service import NotificationService

def get_user_notifications():
    """Controller function to get all notifications for the current user"""
    user_id = get_jwt_identity()['user_id']
    
    # Get notifications for this user, order by created_at desc (newest first)
    notifications = Notification.query.filter_by(user_id=user_id)\
        .order_by(Notification.created_at.desc()).all()
    
    notifications_data = [notification.to_dict() for notification in notifications]
    
    return jsonify({
        'notifications': notifications_data,
        'unread_count': len([n for n in notifications if not n.is_read])
    })

def create_notification():
    """Controller function to create a notification"""
    data = request.get_json()
    
    # Validate notification data
    validation_result = validate_notification_data(data)
    if validation_result:
        return validation_result
    
    message = data.get('message') or data.get('content')
    title = data.get('title') or message[:80]
    notification_type = data.get('notification_type') or data.get('type') or 'general'
    task_id = data.get('task_id')
    reference_id = data.get('reference_id') or task_id

    # Create new notification and emit it when the target user is connected.
    new_notification = NotificationService.send_to_user(
        user_id=data['user_id'],
        notification_type=notification_type,
        title=title,
        message=message,
        reference_id=reference_id,
        task_id=task_id
    )

    if data.get('is_read') and new_notification:
        new_notification.is_read = True
        new_notification.read_at = datetime.now(timezone.utc)
        db.session.commit()

    return jsonify({
        'message': 'Notification created successfully',
        'notification': new_notification.to_dict()
    }), 201

def mark_notification_read(notification_id):
    """Controller function to mark a notification as read"""
    user_id = get_jwt_identity()['user_id']
    
    # Find notification
    notification = Notification.query.get_or_404(notification_id)
    
    # Check if notification belongs to user
    if notification.user_id != user_id:
        return jsonify({'message': 'Notification not found'}), 404
    
    # Mark as read
    notification.is_read = True
    notification.read_at = datetime.now(timezone.utc)
    db.session.commit()
    
    return jsonify({'message': 'Notification marked as read'})

def mark_all_notifications_read():
    """Controller function to mark all notifications as read for the current user"""
    user_id = get_jwt_identity()['user_id']
    now = datetime.now(timezone.utc)
    
    # Update all unread notifications for this user
    Notification.query.filter_by(user_id=user_id, is_read=False)\
        .update({
            Notification.is_read: True,
            Notification.read_at: now
        })
    
    db.session.commit()
    
    return jsonify({'message': 'All notifications marked as read'})

def delete_notification(notification_id):
    """Controller function to delete a notification"""
    user_id = get_jwt_identity()['user_id']
    
    # Find notification
    notification = Notification.query.get_or_404(notification_id)
    
    # Check if notification belongs to user
    if notification.user_id != user_id:
        return jsonify({'message': 'Notification not found'}), 404
    
    # Delete notification
    db.session.delete(notification)
    db.session.commit()
    
    return jsonify({'message': 'Notification deleted'})
