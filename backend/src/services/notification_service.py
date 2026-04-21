from flask_socketio import emit
from datetime import datetime, timezone
from src.socketio_server import connected_users, project_rooms
from src.db.models import Notification
from src.db.db_connection import db

class NotificationService:
    @staticmethod
    def send_to_user(user_id, notification_type, title, message, reference_id=None):
        """
        Send notification to a specific user and save to database
        
        Args:
            user_id: User ID to send notification to
            notification_type: Type of notification (task, comment, etc.)
            title: Notification title
            message: Notification content
            reference_id: ID of the related object (task_id, project_id, etc.)
        """
        # Create notification in database
        notification = Notification(
            user_id=user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            reference_id=reference_id,
            is_read=False,
            created_at=datetime.now(timezone.utc)
        )
        
        # Save to database
        db.session.add(notification)
        db.session.commit()
        
        # Send via Socket.IO if user is connected
        if user_id in connected_users:
            emit('notification', {
                'id': notification.id,
                'type': notification_type,
                'title': title,
                'message': message,
                'reference_id': reference_id,
                'timestamp': notification.created_at.isoformat()
            }, to=connected_users[user_id])
        
        return notification

    @staticmethod
    def send_to_project(project_id, notification_type, title, message, reference_id=None, exclude_user_id=None):
        """
        Send notification to all members of a project
        
        Args:
            project_id: Project ID to send notification to
            notification_type: Type of notification (task, comment, etc.)
            title: Notification title
            message: Notification content  
            reference_id: ID of the related object (task_id, project_id, etc.)
            exclude_user_id: Optional user ID to exclude from notification (usually the initiator)
        """
        # Get all users in the project
        user_ids = project_rooms.get(project_id, [])
        
        # Filter out excluded user
        if exclude_user_id:
            user_ids = [uid for uid in user_ids if uid != exclude_user_id]
        
        notifications = []
        for user_id in user_ids:
            notification = NotificationService.send_to_user(
                user_id=user_id,
                notification_type=notification_type,
                title=title,
                message=message,
                reference_id=reference_id
            )
            notifications.append(notification)
        
        return notifications

    @staticmethod
    def mark_as_read(notification_id, user_id):
        """Mark a notification as read"""
        notification = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
        if notification:
            notification.is_read = True   # changed from notification.read
            notification.read_at = datetime.now(timezone.utc)
            db.session.commit()
            return True
        return False

    @staticmethod
    def mark_all_as_read(user_id):
        """Mark all user's notifications as read"""
        now = datetime.now(timezone.utc)
        Notification.query.filter_by(user_id=user_id, is_read=False).update({  # changed filter key
            'is_read': True,  # changed update key
            'read_at': now
        })
        db.session.commit()
        return True

    @staticmethod
    def get_unread_count(user_id):
        """Get count of unread notifications for a user"""
        return Notification.query.filter_by(user_id=user_id, is_read=False).count()  # use is_read

    @staticmethod
    def get_user_notifications(user_id, page=1, per_page=10, unread_only=False):
        """Get paginated notifications for a user"""
        query = Notification.query.filter_by(user_id=user_id)
        
        if unread_only:
            query = query.filter_by(is_read=False)  # use is_read
            
        return query.order_by(Notification.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )

    @staticmethod
    def task_created_notification(task_id, task_name, project_id, created_by_user_id, assignee_id=None):
        """Send notification for task creation"""
        if assignee_id:
            # Notify the assigned user
            NotificationService.send_to_user(
                user_id=assignee_id,
                notification_type='task_assigned',
                title='New Task Assigned',
                message=f'You were assigned to task: {task_name}',
                reference_id=task_id
            )
        
        # Notify project members about the new task
        NotificationService.send_to_project(
            project_id=project_id,
            notification_type='task_created',
            title='New Task Created',
            message=f'A new task was created: {task_name}',
            reference_id=task_id,
            exclude_user_id=created_by_user_id
        )

    @staticmethod
    def task_updated_notification(task_id, task_name, project_id, updated_by_user_id, 
                                  old_assignee_id=None, new_assignee_id=None):
        """Send notification for task updates"""
        # Notify about assignment change
        if new_assignee_id and new_assignee_id != old_assignee_id:
            NotificationService.send_to_user(
                user_id=new_assignee_id,
                notification_type='task_assigned',
                title='Task Assigned to You',
                message=f'You were assigned to task: {task_name}',
                reference_id=task_id
            )
        
        # Notify project members about the task update
        NotificationService.send_to_project(
            project_id=project_id,
            notification_type='task_updated',
            title='Task Updated',
            message=f'Task was updated: {task_name}',
            reference_id=task_id,
            exclude_user_id=updated_by_user_id
        )

    @staticmethod
    def comment_added_notification(task_id, task_name, project_id, comment_id, 
                                  commenter_user_id, mentioned_user_ids=None):
        """Send notification for new comments"""
        # Notify specifically mentioned users
        if mentioned_user_ids:
            for user_id in mentioned_user_ids:
                NotificationService.send_to_user(
                    user_id=user_id,
                    notification_type='user_mentioned',
                    title='You Were Mentioned',
                    message=f'You were mentioned in a comment on task: {task_name}',
                    reference_id=comment_id
                )
        
        # Notify project members about the new comment
        NotificationService.send_to_project(
            project_id=project_id,
            notification_type='comment_added',
            title='New Comment',
            message=f'New comment on task: {task_name}',
            reference_id=comment_id,
            exclude_user_id=commenter_user_id
        )
