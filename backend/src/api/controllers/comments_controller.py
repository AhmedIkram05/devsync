# Comment controller - business logic

import logging
from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, get_jwt
from ...db.models import db, Comment, Task, User  # Changed to relative import
from ...auth.rbac import Role  # Changed to relative import
from ..validators.comment_validator import validate_comment_data  # Changed to relative import
from ...services.notification_service import NotificationService

logger = logging.getLogger(__name__)


def _run_notification(callback, *args, **kwargs):
    """Create notifications without making the primary comment mutation fail."""
    try:
        callback(*args, **kwargs)
    except Exception:
        db.session.rollback()
        logger.exception("Failed to create comment notification")

def get_task_comments(task_id):
    """Controller function to get all comments for a task"""
    # Check if task exists
    task = Task.query.get_or_404(task_id)
    
    # Get comments for this task
    comments = Comment.query.filter_by(task_id=task_id).order_by(Comment.created_at).all()
    
    # Get user info for each comment
    comments_data = []
    for comment in comments:
        user = User.query.get(comment.user_id)
        
        updated_at = getattr(comment, 'updated_at', None)
        comment_data = {
            'id': comment.id,
            'content': comment.content,
            'user_id': comment.user_id,
            'user_name': user.name if user else 'Unknown',
            'author_name': user.name if user else 'Unknown',
            'user_avatar': getattr(user, 'avatar', None) if user else None,
            'created_at': comment.created_at.isoformat() if comment.created_at else None,
            'updated_at': updated_at.isoformat() if updated_at else None
        }
        comments_data.append(comment_data)
    
    return jsonify({'comments': comments_data})

def add_comment(task_id):
    """Controller function to add a comment to a task"""
    data = request.get_json()
    
    # Validate comment data
    validation_result = validate_comment_data(data)
    if validation_result:
        return validation_result
    
    # Check if task exists
    task = Task.query.get_or_404(task_id)
    
    user_id = get_jwt_identity()['user_id']
    
    # Create new comment
    new_comment = Comment(
        content=data['content'],
        task_id=task_id,
        user_id=user_id
    )
    
    db.session.add(new_comment)
    db.session.commit()

    mentioned_user_ids = data.get('mentioned_user_ids') or data.get('mentioned_users') or []
    recipient_user_ids = {
        getattr(task, 'assigned_to', None),
        getattr(task, 'created_by', None),
    }
    recipient_user_ids.discard(None)

    _run_notification(
        NotificationService.comment_added_notification,
        task_id,
        getattr(task, 'title', f'Task {task_id}'),
        getattr(task, 'project_id', None),
        new_comment.id,
        user_id,
        mentioned_user_ids,
        recipient_user_ids
    )
    
    # Get user info for response
    user = User.query.get(user_id)
    
    return jsonify({
        'message': 'Comment added successfully',
        'comment': {
            'id': new_comment.id,
            'content': new_comment.content,
            'user_id': user_id,
            'user_name': user.name if user else 'Unknown',
            'author_name': user.name if user else 'Unknown',
            'user_avatar': getattr(user, 'avatar', None) if user else None,
            'created_at': new_comment.created_at.isoformat() if new_comment.created_at else None
        }
    }), 201

def update_comment(comment_id):
    """Controller function to update a comment"""
    data = request.get_json()
    
    # Validate comment data
    validation_result = validate_comment_data(data)
    if validation_result:
        return validation_result
    
    comment = Comment.query.get_or_404(comment_id)
    
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')
    
    # Check if user is the author of the comment or an admin
    if comment.user_id != user_id and user_role != Role.ADMIN.value:
        return jsonify({'message': 'You can only update your own comments'}), 403
    
    # Update comment content
    comment.content = data['content']
    
    db.session.commit()
    
    return jsonify({
        'message': 'Comment updated successfully',
        'comment': {
            'id': comment.id,
            'content': comment.content,
            'updated_at': comment.updated_at.isoformat() if comment.updated_at else None
        }
    })

def delete_comment(comment_id):
    """Controller function to delete a comment"""
    comment = Comment.query.get_or_404(comment_id)
    
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')
    
    # Check if user is the author of the comment or an admin
    if comment.user_id != user_id and user_role != Role.ADMIN.value:
        return jsonify({'message': 'You can only delete your own comments'}), 403
    
    db.session.delete(comment)
    db.session.commit()
    
    return jsonify({'message': 'Comment deleted successfully'})
