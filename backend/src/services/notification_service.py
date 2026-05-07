import logging
from datetime import datetime, timezone
from src.socketio_server import socketio, connected_users, project_rooms
from src.db.models import Notification, Project
from src.db.db_connection import db

logger = logging.getLogger(__name__)


def _ids_match(left, right):
    return str(left) == str(right)


class NotificationService:
    @staticmethod
    def send_to_user(user_id, notification_type, title, message, reference_id=None, task_id=None):
        """
        Send notification to a specific user and save to database
        
        Args:
            user_id: User ID to send notification to
            notification_type: Type of notification (task, comment, etc.)
            title: Notification title
            message: Notification content
            reference_id: ID of the related object (task_id, project_id, etc.)
            task_id: Optional task ID related to the notification
        """
        if user_id in (None, ''):
            return None
        if isinstance(user_id, str) and user_id.isdigit():
            user_id = int(user_id)

        # Create notification in database
        notification = Notification(
            user_id=user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            reference_id=reference_id,
            task_id=task_id,
            is_read=False,
            created_at=datetime.now(timezone.utc)
        )
        
        # Save to database
        db.session.add(notification)
        db.session.commit()
        
        # Send via Socket.IO if user is connected
        if user_id in connected_users:
            try:
                socketio.emit('notification', notification.to_dict(), to=connected_users[user_id])
            except Exception:
                logger.exception("Failed to emit notification %s to user %s", notification.id, user_id)
        
        return notification

    @staticmethod
    def _project_member_ids(project_id):
        if project_id in (None, ''):
            return []

        user_ids = set()

        try:
            project = Project.query.get(project_id)
            if project:
                if getattr(project, 'created_by', None) is not None:
                    user_ids.add(project.created_by)

                members = getattr(project, 'team_members', []) or []
                if hasattr(members, 'all'):
                    members = members.all()

                for member in members:
                    member_id = getattr(member, 'id', None)
                    if member_id is not None:
                        user_ids.add(member_id)
        except Exception:
            # Unit tests and partially configured scripts may not have a DB-bound app context.
            logger.debug("Falling back to socket room members for project notification", exc_info=True)

        for key in (project_id, str(project_id)):
            for user_id in project_rooms.get(key, []):
                if user_id is not None:
                    user_ids.add(user_id)

        return list(user_ids)

    @staticmethod
    def send_to_project(
        project_id,
        notification_type,
        title,
        message,
        reference_id=None,
        exclude_user_id=None,
        exclude_user_ids=None,
        task_id=None
    ):
        """
        Send notification to all members of a project
        
        Args:
            project_id: Project ID to send notification to
            notification_type: Type of notification (task, comment, etc.)
            title: Notification title
            message: Notification content  
            reference_id: ID of the related object (task_id, project_id, etc.)
            exclude_user_id: Optional user ID to exclude from notification (usually the initiator)
            exclude_user_ids: Optional iterable of additional user IDs to exclude
            task_id: Optional task ID related to the notification
        """
        user_ids = NotificationService._project_member_ids(project_id)
        
        excluded = set(str(uid) for uid in (exclude_user_ids or []) if uid is not None)
        if exclude_user_id is not None:
            excluded.add(str(exclude_user_id))

        seen = set()
        filtered_user_ids = []
        for user_id in user_ids:
            user_key = str(user_id)
            if user_key in excluded or user_key in seen:
                continue
            seen.add(user_key)
            filtered_user_ids.append(user_id)
        
        notifications = []
        for user_id in filtered_user_ids:
            notification = NotificationService.send_to_user(
                user_id=user_id,
                notification_type=notification_type,
                title=title,
                message=message,
                reference_id=reference_id,
                task_id=task_id
            )
            if notification:
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
        excluded_project_user_ids = [created_by_user_id]

        if assignee_id:
            # Notify the assigned user
            if not _ids_match(assignee_id, created_by_user_id):
                NotificationService.send_to_user(
                    user_id=assignee_id,
                    notification_type='task_assigned',
                    title='New Task Assigned',
                    message=f'You were assigned to task: {task_name}',
                    reference_id=task_id,
                    task_id=task_id
                )
            excluded_project_user_ids.append(assignee_id)
        
        # Notify project members about the new task
        NotificationService.send_to_project(
            project_id=project_id,
            notification_type='task_created',
            title='New Task Created',
            message=f'A new task was created: {task_name}',
            reference_id=task_id,
            exclude_user_ids=excluded_project_user_ids,
            task_id=task_id
        )

    @staticmethod
    def task_updated_notification(task_id, task_name, project_id, updated_by_user_id, 
                                  old_assignee_id=None, new_assignee_id=None):
        """Send notification for task updates"""
        excluded_project_user_ids = [updated_by_user_id]

        # Notify about assignment change
        if new_assignee_id and new_assignee_id != old_assignee_id:
            if not _ids_match(new_assignee_id, updated_by_user_id):
                NotificationService.send_to_user(
                    user_id=new_assignee_id,
                    notification_type='task_assigned',
                    title='Task Assigned to You',
                    message=f'You were assigned to task: {task_name}',
                    reference_id=task_id,
                    task_id=task_id
                )
            excluded_project_user_ids.append(new_assignee_id)
        
        # Notify project members about the task update
        NotificationService.send_to_project(
            project_id=project_id,
            notification_type='task_updated',
            title='Task Updated',
            message=f'Task was updated: {task_name}',
            reference_id=task_id,
            exclude_user_ids=excluded_project_user_ids,
            task_id=task_id
        )

    @staticmethod
    def comment_added_notification(task_id, task_name, project_id, comment_id, 
                                  commenter_user_id, mentioned_user_ids=None,
                                  recipient_user_ids=None):
        """Send notification for new comments"""
        excluded_project_user_ids = [commenter_user_id]

        # Notify specifically mentioned users
        if mentioned_user_ids:
            for user_id in mentioned_user_ids:
                if not _ids_match(user_id, commenter_user_id):
                    NotificationService.send_to_user(
                        user_id=user_id,
                        notification_type='user_mentioned',
                        title='You Were Mentioned',
                        message=f'You were mentioned in a comment on task: {task_name}',
                        reference_id=comment_id,
                        task_id=task_id
                    )
                excluded_project_user_ids.append(user_id)

        if recipient_user_ids:
            for user_id in recipient_user_ids:
                if user_id in (None, '') or _ids_match(user_id, commenter_user_id):
                    continue
                NotificationService.send_to_user(
                    user_id=user_id,
                    notification_type='comment_added',
                    title='New Comment',
                    message=f'New comment on task: {task_name}',
                    reference_id=comment_id,
                    task_id=task_id
                )
                excluded_project_user_ids.append(user_id)
        
        # Notify project members about the new comment
        NotificationService.send_to_project(
            project_id=project_id,
            notification_type='comment_added',
            title='New Comment',
            message=f'New comment on task: {task_name}',
            reference_id=comment_id,
            exclude_user_ids=excluded_project_user_ids,
            task_id=task_id
        )
