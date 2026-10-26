"""System Settings Service"""

import time
from datetime import UTC, datetime, timedelta

from ..db.models import AuditLog, Comment, Notification, Project, SystemSetting, Task, TaskGitHubLink, db
from ..db.transaction import commit_or_flush

DEFAULT_SETTINGS = {
    "default_user_role": "developer",
    "allow_self_registration": True,
    "audit_log_retention_days": 30,
    "auto_archive_completed_projects": True,
    "project_retention_days": 30,
    "notify_on_overdue_tasks": True,
}

SUPPORTED_SETTINGS = set(DEFAULT_SETTINGS.keys())

# Hot paths (GET /tasks polls notify_on_overdue_tasks every request) pay one
# SystemSetting query per call. A short in-process TTL keeps that at one query
# per minute per key; a cached value may lag an admin update by up to the TTL.
BOOL_CACHE_TTL_SECONDS = 60
_bool_cache = {}  # key -> (expires_at_monotonic, value)

# Retention cleanups run in bounded batches so one pass never issues a single
# unbounded DELETE that locks the whole table for a long transaction. A backlog
# larger than RETENTION_BATCH_SIZE * RETENTION_MAX_BATCHES is finished by the
# next scheduled run.
RETENTION_BATCH_SIZE = 1000
RETENTION_MAX_BATCHES = 100


def _to_bool(value, default):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    return default


def _to_int_with_default(value, default):
    try:
        parsed = int(value)
        return parsed if parsed >= 0 else default
    except (TypeError, ValueError):
        return default


_to_int = _to_int_with_default


def _normalize_setting(key, value):
    default = DEFAULT_SETTINGS[key]

    if key in {"allow_self_registration", "auto_archive_completed_projects", "notify_on_overdue_tasks"}:
        return _to_bool(value, default)

    if key in {"audit_log_retention_days", "project_retention_days"}:
        return _to_int(value, default)

    if key == "default_user_role":
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
            new_setting = SystemSetting(key=key, value=normalized_value, updated_by=actor_id)
            db.session.add(new_setting)

    commit_or_flush(db)
    _bool_cache.clear()


def get_default_role():
    """Get the default role for new users."""
    return get_settings().get("default_user_role", "developer")


def get_bool_setting(key, default=False):
    """Bool read with a short in-process TTL cache (see BOOL_CACHE_TTL_SECONDS)."""
    now = time.monotonic()
    cached = _bool_cache.get(key)
    if cached is not None and cached[0] > now:
        return cached[1]
    value = _to_bool(get_settings().get(key, default), default)
    _bool_cache[key] = (now + BOOL_CACHE_TTL_SECONDS, value)
    return value


def get_int_setting(key, default=0):
    return _to_int(get_settings().get(key, default), default)


def cleanup_old_audit_logs(retention_days=None, dry_run=False):
    """Delete audit logs older than the retention window, in bounded batches.

    At most RETENTION_BATCH_SIZE rows are deleted per iteration and the loop
    stops after RETENTION_MAX_BATCHES iterations. With dry_run=True nothing is
    deleted and nothing is committed; the returned count is what would have
    been removed, itself capped by those same two limits.
    """
    try:
        days = (
            get_int_setting("audit_log_retention_days", DEFAULT_SETTINGS["audit_log_retention_days"])
            if retention_days is None
            else _to_int(retention_days, DEFAULT_SETTINGS["audit_log_retention_days"])
        )
        if days <= 0:
            return 0

        cutoff = datetime.now(UTC) - timedelta(days=days)

        if dry_run:
            return min(
                AuditLog.query.filter(AuditLog.created_at < cutoff).count(),
                RETENTION_BATCH_SIZE * RETENTION_MAX_BATCHES,
            )

        deleted_count = 0
        for _ in range(RETENTION_MAX_BATCHES):
            expired_ids = [
                row_id
                for (row_id,) in db.session.query(AuditLog.id)
                .filter(AuditLog.created_at < cutoff)
                .order_by(AuditLog.id)
                .limit(RETENTION_BATCH_SIZE)
                .all()
            ]
            if not expired_ids:
                break

            AuditLog.query.filter(AuditLog.id.in_(expired_ids)).delete(synchronize_session=False)
            deleted_count += len(expired_ids)

            if len(expired_ids) < RETENTION_BATCH_SIZE:
                break

        if deleted_count:
            commit_or_flush(db)
        return deleted_count
    except Exception:
        db.session.rollback()
        return 0


def cleanup_completed_projects(retention_days=None, dry_run=False):
    """Delete completed projects and their dependents, in bounded batches.

    At most RETENTION_BATCH_SIZE projects are processed per iteration and the
    loop stops after RETENTION_MAX_BATCHES iterations. With dry_run=True no row
    is deleted and nothing is committed; the returned count is what would have
    been removed, capped by those same two limits.
    """
    try:
        days = (
            get_int_setting("project_retention_days", DEFAULT_SETTINGS["project_retention_days"])
            if retention_days is None
            else _to_int(retention_days, DEFAULT_SETTINGS["project_retention_days"])
        )
        if days <= 0:
            return 0

        cutoff = datetime.now(UTC) - timedelta(days=days)

        if dry_run:
            return min(
                Project.query.filter(Project.status == "completed", Project.updated_at < cutoff).count(),
                RETENTION_BATCH_SIZE * RETENTION_MAX_BATCHES,
            )

        deleted_projects = 0
        for _ in range(RETENTION_MAX_BATCHES):
            batch = (
                Project.query.filter(Project.status == "completed", Project.updated_at < cutoff)
                .order_by(Project.id)
                .limit(RETENTION_BATCH_SIZE)
                .all()
            )
            if not batch:
                break

            for project in batch:
                task_ids = [task.id for task in (project.tasks or [])]

                if task_ids:
                    TaskGitHubLink.query.filter(TaskGitHubLink.task_id.in_(task_ids)).delete(synchronize_session=False)
                    Comment.query.filter(Comment.task_id.in_(task_ids)).delete(synchronize_session=False)
                    Notification.query.filter(Notification.task_id.in_(task_ids)).delete(synchronize_session=False)
                    Task.query.filter(Task.id.in_(task_ids)).delete(synchronize_session=False)

                db.session.delete(project)

            deleted_projects += len(batch)

            if len(batch) < RETENTION_BATCH_SIZE:
                break

        if deleted_projects:
            commit_or_flush(db)

        return deleted_projects
    except Exception:
        db.session.rollback()
        return 0


def run_retention_cleanup(audit_retention_days=None, project_retention_days=None, dry_run=False):
    """Run all retention cleanups and return a summary.

    dry_run=True forwards to both cleanups, which report what they would remove
    without deleting or committing.
    """
    audit_deleted = cleanup_old_audit_logs(audit_retention_days, dry_run=dry_run)
    project_deleted = cleanup_completed_projects(project_retention_days, dry_run=dry_run)
    return {
        "audit_logs_deleted": audit_deleted,
        "projects_deleted": project_deleted,
        "dry_run": bool(dry_run),
    }
