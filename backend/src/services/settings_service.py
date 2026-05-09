"""System Settings Service"""
from datetime import datetime, timedelta, timezone

from ..db.models import db, SystemSetting, AuditLog, Project, Task, Comment, Notification, TaskGitHubLink


DEFAULT_SETTINGS = {
    'default_user_role': 'developer',
    'allow_self_registration': True,
    'audit_log_retention_days': 30,
    'auto_archive_completed_projects': True,
    'project_retention_days': 30,
    'notify_on_overdue_tasks': True,
}

SUPPORTED_SETTINGS = set(DEFAULT_SETTINGS.keys())


def _to_bool(value, default):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {'true', '1', 'yes', 'on'}:
            return True
        if normalized in {'false', '0', 'no', 'off'}:
            return False
    return default


def _to_int(value, default):
    try:
        parsed = int(value)
        return parsed if parsed >= 0 else default
    except (TypeError, ValueError):
        return default


def _normalize_setting(key, value):
    default = DEFAULT_SETTINGS[key]

    if key in {'allow_self_registration', 'auto_archive_completed_projects', 'notify_on_overdue_tasks'}:
        return _to_bool(value, default)

    if key in {'audit_log_retention_days', 'project_retention_days'}:
        return _to_int(value, default)

    if key == 'default_user_role':
        return value if isinstance(value, str) and value else default

    return value

def get_settings():
    """Retrieve all system settings as a dictionary."""
    settings = {key: value for key, value in DEFAULT_SETTINGS.items()}

    try:
        for setting in SystemSetting.query.filter(SystemSetting.key.in_(SUPPORTED_SETTINGS)).all():
            settings[setting.key] = _normalize_setting(setting.key, setting.value)
    except Exception:
        # Fall back to defaults when the table is missing or the SQLAlchemy app
        # context is not fully initialized, such as in lightweight unit tests.
        return settings

    return settings

def update_settings(data, actor_id):
    """Update multiple system settings."""
    for key, value in data.items():
        if key not in SUPPORTED_SETTINGS:
            continue

        normalized_value = _normalize_setting(key, value)
        setting = SystemSetting.query.get(key)
        if setting:
            setting.value = normalized_value
            setting.updated_by = actor_id
        else:
            new_setting = SystemSetting(
                key=key,
                value=normalized_value,
                updated_by=actor_id
            )
            db.session.add(new_setting)
    
    db.session.commit()

def get_default_role():
    """Get the default role for new users."""
    return get_settings().get('default_user_role', 'developer')


def get_bool_setting(key, default=False):
    return _to_bool(get_settings().get(key, default), default)


def get_int_setting(key, default=0):
    return _to_int(get_settings().get(key, default), default)


def cleanup_old_audit_logs(retention_days=None):
    """Delete audit logs older than the configured retention window."""
    try:
        days = get_int_setting('audit_log_retention_days', DEFAULT_SETTINGS['audit_log_retention_days']) if retention_days is None else _to_int(retention_days, DEFAULT_SETTINGS['audit_log_retention_days'])
        if days <= 0:
            return 0

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        deleted_count = AuditLog.query.filter(AuditLog.created_at < cutoff).delete(synchronize_session=False)
        db.session.commit()
        return deleted_count
    except Exception:
        db.session.rollback()
        return 0


def cleanup_completed_projects(retention_days=None):
    """Delete completed projects and their dependent records after the retention window."""
    try:
        days = get_int_setting('project_retention_days', DEFAULT_SETTINGS['project_retention_days']) if retention_days is None else _to_int(retention_days, DEFAULT_SETTINGS['project_retention_days'])
        if days <= 0:
            return 0

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        completed_projects = Project.query.filter(Project.status == 'completed', Project.updated_at < cutoff).all()

        deleted_projects = 0
        for project in completed_projects:
            task_ids = [task.id for task in (project.tasks or [])]

            if task_ids:
                TaskGitHubLink.query.filter(TaskGitHubLink.task_id.in_(task_ids)).delete(synchronize_session=False)
                Comment.query.filter(Comment.task_id.in_(task_ids)).delete(synchronize_session=False)
                Notification.query.filter(Notification.task_id.in_(task_ids)).delete(synchronize_session=False)
                Task.query.filter(Task.id.in_(task_ids)).delete(synchronize_session=False)

            db.session.delete(project)
            deleted_projects += 1

        if deleted_projects:
            db.session.commit()

        return deleted_projects
    except Exception:
        db.session.rollback()
        return 0


def run_retention_cleanup(audit_retention_days=None, project_retention_days=None):
    """Run all retention cleanups and return a summary."""
    audit_deleted = cleanup_old_audit_logs(audit_retention_days)
    project_deleted = cleanup_completed_projects(project_retention_days)
    return {
        'audit_logs_deleted': audit_deleted,
        'projects_deleted': project_deleted,
    }
