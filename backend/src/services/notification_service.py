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
            project = db.session.get(Project, project_id)
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

    @staticmethod
    def task_overdue_notification(task_id, task_name, project_id, recipient_user_id, due_date=None):
        """Send a one-time overdue task notification to a specific user."""
        if recipient_user_id in (None, ''):
            return None

        existing = Notification.query.filter_by(
            user_id=recipient_user_id,
            task_id=task_id,
            notification_type='task_overdue',
        ).first()
        if existing:
            return existing

        due_label = due_date.strftime('%b %d, %Y') if hasattr(due_date, 'strftime') else 'past due'
        return NotificationService.send_to_user(
            user_id=recipient_user_id,
            notification_type='task_overdue',
            title='Task is overdue',
            message=f'Task "{task_name}" was due on {due_label}.',
            reference_id=task_id,
            task_id=task_id,
        )

    @staticmethod
    def send_to_recipients(recipient_user_ids, notification_type, title, message, reference_id=None, task_id=None):
        """
        Send notification to a specific list of recipients.
        
        Args:
            recipient_user_ids: List of user IDs to send notification to
            notification_type: Type of notification
            title: Notification title
            message: Notification content
            reference_id: ID of the related object
            task_id: Optional task ID related to the notification
        """
        if not recipient_user_ids:
            return []
        
        notifications = []
        for user_id in recipient_user_ids:
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
    def task_created_notification_v2(task_id, task_name, project_id, created_by_user_id, assignee_id=None, 
                                      project_name=None, assignee_name=None, recipient_user_ids=None):
        """
        Send notification for task creation using role-based recipients with detailed context.
        
        Args:
            task_id: Task ID
            task_name: Task name
            project_id: Project ID
            created_by_user_id: User who created the task
            assignee_id: User assigned to the task (if any)
            project_name: Name of the project (fetched if None)
            assignee_name: Name of the assignee (fetched if None)
            recipient_user_ids: Explicit list of user IDs to notify (if None, calculates from recipients module)
        """
        # Fetch project name if not provided
        if project_name is None and project_id:
            try:
                from ..db.models import Project
                project = Project.query.get(project_id)
                project_name = project.name if project else None
            except Exception:
                project_name = None
        
        # Fetch assignee name if not provided
        if assignee_name is None and assignee_id:
            try:
                from ..db.models import User
                assignee = User.query.get(assignee_id)
                assignee_name = assignee.name if assignee else None
            except Exception:
                assignee_name = None
        
        if recipient_user_ids is None:
            from .notification_recipients import get_recipients_for_task_create
            recipient_user_ids = get_recipients_for_task_create(
                task_id=task_id,
                project_id=project_id,
                creator_id=created_by_user_id,
                assignee_id=assignee_id
            )
        
        # Build context-rich message
        project_context = f" in {project_name}" if project_name else ""
        assignee_context = f" assigned to {assignee_name}" if assignee_name else ""
        message = f'New task "{task_name}"{project_context}{assignee_context}'
        
        return NotificationService.send_to_recipients(
            recipient_user_ids=recipient_user_ids,
            notification_type='task_created',
            title='New Task Created',
            message=message,
            reference_id=task_id,
            task_id=task_id
        )

    @staticmethod
    def task_updated_notification_v2(task_id, task_name, project_id, updated_by_user_id, assignee_id=None,
                                      changed_fields=None, project_name=None, recipient_user_ids=None):
        """
        Send notification for task updates using role-based recipients with specific change details.
        
        Args:
            task_id: Task ID
            task_name: Task name
            project_id: Project ID
            updated_by_user_id: User who updated the task
            assignee_id: Current assignee of the task (if any)
            changed_fields: Dict with field names as keys and (old_value, new_value) tuples as values
                           e.g. {'status': ('todo', 'in_progress'), 'priority': ('low', 'high')}
            project_name: Name of the project (fetched if None)
            recipient_user_ids: Explicit list of user IDs to notify (if None, calculates from recipients module)
        """
        # Fetch project name if not provided
        if project_name is None and project_id:
            try:
                from ..db.models import Project
                project = Project.query.get(project_id)
                project_name = project.name if project else None
            except Exception:
                project_name = None
        
        if recipient_user_ids is None:
            from .notification_recipients import get_recipients_for_task_update
            recipient_user_ids = get_recipients_for_task_update(
                task_id=task_id,
                project_id=project_id,
                updater_id=updated_by_user_id,
                assignee_id=assignee_id
            )
        
        # Build specific message about what changed
        project_context = f" in {project_name}" if project_name else ""
        
        if changed_fields:
            # Get the most important change to highlight
            important_fields = ['status', 'assigned_to', 'deadline', 'priority']
            main_change = None
            
            for field in important_fields:
                if field in changed_fields:
                    old_val, new_val = changed_fields[field]
                    if field == 'status':
                        main_change = f"status changed to {new_val}"
                    elif field == 'assigned_to':
                        # Try to get assignee name
                        try:
                            from ..db.models import User
                            assignee = User.query.get(new_val) if new_val else None
                            assignee_name = assignee.name if assignee else "someone"
                        except Exception:
                            assignee_name = "someone"
                        main_change = f"assigned to {assignee_name}"
                    elif field == 'deadline':
                        main_change = f"deadline updated to {new_val}"
                    elif field == 'priority':
                        main_change = f"priority set to {new_val}"
                    break
            
            if main_change:
                message = f'Task "{task_name}"{project_context} - {main_change}'
            else:
                # If no important field changed, list what did
                changed_list = ', '.join(changed_fields.keys())
                message = f'Task "{task_name}"{project_context} updated ({changed_list})'
        else:
            message = f'Task "{task_name}"{project_context} was updated'
        
        return NotificationService.send_to_recipients(
            recipient_user_ids=recipient_user_ids,
            notification_type='task_updated',
            title='Task Updated',
            message=message,
            reference_id=task_id,
            task_id=task_id
        )

    @staticmethod
    def user_crud_notification(action_type, affected_user_name, affected_user_role=None, 
                               changed_fields=None, admin_user_id=None, recipient_user_ids=None):
        """
        Send notification for user CRUD operations with specific details.
        
        Args:
            action_type: 'user_created', 'user_updated', 'user_deleted', 'user_role_changed'
            affected_user_name: Name of the user being affected
            affected_user_role: Role of the user (for create/role_change)
            changed_fields: Dict with what was changed (for updates)
            admin_user_id: User ID performing the action (excluded from recipients)
            recipient_user_ids: Explicit list of user IDs to notify (if None, gets all admins)
        """
        if recipient_user_ids is None:
            from .notification_recipients import get_recipients_for_user_crud
            recipient_user_ids = get_recipients_for_user_crud(action_type, None)
        
        # Exclude the admin who performed the action
        if admin_user_id:
            recipient_user_ids = [uid for uid in recipient_user_ids if uid != admin_user_id]
        
        action_titles = {
            'user_created': 'New User Created',
            'user_updated': 'User Updated',
            'user_deleted': 'User Deleted',
            'user_role_changed': 'User Role Changed'
        }
        
        # Build specific messages
        if action_type == 'user_created':
            role_info = f" as {affected_user_role}" if affected_user_role else ""
            action_messages = f'New user "{affected_user_name}"{role_info} created'
        elif action_type == 'user_role_changed':
            role_info = f" to {affected_user_role}" if affected_user_role else ""
            action_messages = f'User "{affected_user_name}" role changed{role_info}'
        elif action_type == 'user_updated':
            if changed_fields:
                changed_list = ', '.join(changed_fields.keys())
                action_messages = f'User "{affected_user_name}" updated ({changed_list})'
            else:
                action_messages = f'User "{affected_user_name}" was updated'
        elif action_type == 'user_deleted':
            action_messages = f'User "{affected_user_name}" was deleted'
        else:
            action_messages = f'User operation on "{affected_user_name}"'
        
        return NotificationService.send_to_recipients(
            recipient_user_ids=recipient_user_ids,
            notification_type=action_type,
            title=action_titles.get(action_type, 'User Operation'),
            message=action_messages,
            reference_id=None
        )

    @staticmethod
    def report_available_notification(report_id, report_type, project_id, creator_id, recipient_user_ids=None):
        """
        Send notification for report availability.
        
        Args:
            report_id: Report ID
            report_type: Type of report ('tasks', 'developers', 'github', etc.)
            project_id: Project ID the report is for
            creator_id: User who created the report
            recipient_user_ids: Explicit list of user IDs to notify (if None, calculates from recipients module)
        """
        if recipient_user_ids is None:
            from .notification_recipients import get_recipients_for_report_available
            recipient_user_ids = get_recipients_for_report_available(
                project_id=project_id,
                creator_id=creator_id
            )
        
        return NotificationService.send_to_recipients(
            recipient_user_ids=recipient_user_ids,
            notification_type='report_available',
            title='Report Available for Download',
            message=f'Your {report_type} report is ready to download',
            reference_id=report_id
        )

    @staticmethod
    def project_member_added_notification(project_id, new_member_name, new_member_id, adder_id, recipient_user_ids=None):
        """
        Send notification when a new member is added to a project.
        
        Args:
            project_id: Project ID
            new_member_name: Name of the new member
            new_member_id: User ID of the new member
            adder_id: User ID of the person adding the member
            recipient_user_ids: Explicit list of user IDs to notify
        """
        if recipient_user_ids is None:
            from .notification_recipients import get_recipients_for_project_member_add
            recipient_user_ids = get_recipients_for_project_member_add(
                project_id=project_id,
                new_member_id=new_member_id,
                adder_id=adder_id
            )
        
        return NotificationService.send_to_recipients(
            recipient_user_ids=recipient_user_ids,
            notification_type='project_member_added',
            title='New Member Added to Project',
            message=f'{new_member_name} was added to your project',
            reference_id=project_id
        )
