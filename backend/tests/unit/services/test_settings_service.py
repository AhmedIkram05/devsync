from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch

from backend.src.services import settings_service


def _audit_id_chain(mock_db):
    """Mock the object .limit() is called on: db.session.query(AuditLog.id).filter(...).order_by(...)."""
    return mock_db.session.query.return_value.filter.return_value.order_by.return_value


def _project_batch(mock_project):
    """Mock the object .order_by() is called on: Project.query.filter(...)."""
    return mock_project.query.filter.return_value.order_by.return_value


def test_to_bool_conversions():
    assert settings_service._to_bool(True, False) is True
    assert settings_service._to_bool("yes", False) is True
    assert settings_service._to_bool("off", True) is False
    assert settings_service._to_bool("unknown", True) is True


def test_to_int_conversions():
    assert settings_service._to_int("20", 1) == 20
    assert settings_service._to_int(-10, 1) == 1
    assert settings_service._to_int("x", 3) == 3


def test_normalize_setting_by_key():
    assert settings_service._normalize_setting("allow_self_registration", "true") is True
    assert settings_service._normalize_setting("audit_log_retention_days", "42") == 42
    assert settings_service._normalize_setting("default_user_role", "team_lead") == "team_lead"
    assert settings_service._normalize_setting("default_user_role", "") == "developer"


@patch("backend.src.services.settings_service.SystemSetting")
def test_get_settings_merges_db_values(mock_system_setting):
    setting = SimpleNamespace(key="audit_log_retention_days", value="14")
    mock_system_setting.query.filter.return_value.all.return_value = [setting]

    merged = settings_service.get_settings()

    assert merged["audit_log_retention_days"] == 14
    assert merged["default_user_role"] == "developer"


@patch("backend.src.services.settings_service.SystemSetting")
def test_get_settings_falls_back_to_defaults_on_error(mock_system_setting):
    mock_system_setting.query.filter.side_effect = Exception("table missing")

    merged = settings_service.get_settings()

    assert merged == settings_service.DEFAULT_SETTINGS


@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.SystemSetting")
def test_update_settings_updates_existing_and_creates_new(mock_system_setting, mock_db):
    existing = SimpleNamespace(key="default_user_role", value="developer", updated_by=None)

    def get_side_effect(key):
        return existing if key == "default_user_role" else None

    mock_system_setting.query.get.side_effect = get_side_effect

    settings_service.update_settings(
        {
            "default_user_role": "admin",
            "audit_log_retention_days": "21",
            "unsupported": "ignored",
        },
        actor_id=9,
    )

    assert existing.value == "admin"
    assert existing.updated_by == 9
    mock_system_setting.assert_called_once_with(
        key="audit_log_retention_days",
        value=21,
        updated_by=9,
    )
    mock_db.session.add.assert_called_once()
    mock_db.session.commit.assert_called_once()


@patch("backend.src.services.settings_service.get_settings", return_value={"default_user_role": "team_lead"})
def test_get_default_role(mock_get_settings):
    assert settings_service.get_default_role() == "team_lead"
    mock_get_settings.assert_called_once()


@patch("backend.src.services.settings_service.get_settings", return_value={"allow_self_registration": "false"})
def test_get_bool_setting_uses_default_and_normalization(mock_get_settings):
    settings_service._bool_cache.clear()
    try:
        assert settings_service.get_bool_setting("allow_self_registration", default=True) is False
    finally:
        settings_service._bool_cache.clear()


@patch("backend.src.services.settings_service.get_settings", return_value={"notify_on_overdue_tasks": "false"})
def test_get_bool_setting_caches_briefly(mock_get_settings):
    """The hot GET /tasks setting read hits the DB once per TTL window, not per request."""
    settings_service._bool_cache.clear()
    try:
        assert settings_service.get_bool_setting("notify_on_overdue_tasks", True) is False
        assert settings_service.get_bool_setting("notify_on_overdue_tasks", True) is False
        assert mock_get_settings.call_count == 1

        # A different key is a separate cache entry.
        assert settings_service.get_bool_setting("allow_self_registration", True) is True
        assert mock_get_settings.call_count == 2
    finally:
        settings_service._bool_cache.clear()


@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.SystemSetting")
def test_update_settings_clears_bool_cache(mock_system_setting, mock_db):
    settings_service._bool_cache["notify_on_overdue_tasks"] = (float("inf"), True)
    try:
        settings_service.update_settings({"notify_on_overdue_tasks": False}, actor_id=1)
        assert "notify_on_overdue_tasks" not in settings_service._bool_cache
    finally:
        settings_service._bool_cache.clear()


@patch("backend.src.services.settings_service.get_settings", return_value={"audit_log_retention_days": "15"})
def test_get_int_setting_uses_default_and_normalization(mock_get_settings):
    assert settings_service.get_int_setting("audit_log_retention_days", default=5) == 15


@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.AuditLog")
def test_cleanup_old_audit_logs_happy_path(mock_audit_log, mock_db):
    mock_audit_log.created_at = MagicMock()
    mock_audit_log.created_at.__lt__.return_value = True
    ids = _audit_id_chain(mock_db)
    ids.limit.return_value.all.side_effect = [[(4,), (5,)], []]

    deleted = settings_service.cleanup_old_audit_logs(retention_days=30)

    assert deleted == 2
    ids.limit.assert_called_with(settings_service.RETENTION_BATCH_SIZE)
    mock_audit_log.query.filter.return_value.delete.assert_called_once()
    mock_db.session.commit.assert_called_once()


@patch("backend.src.services.settings_service.RETENTION_BATCH_SIZE", 2)
@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.AuditLog")
def test_cleanup_old_audit_logs_deletes_in_bounded_batches(mock_audit_log, mock_db):
    mock_audit_log.created_at = MagicMock()
    mock_audit_log.created_at.__lt__.return_value = True
    ids = _audit_id_chain(mock_db)
    ids.limit.return_value.all.side_effect = [[(1,), (2,)], [(3,), (4,)], [(5,)]]

    deleted = settings_service.cleanup_old_audit_logs(retention_days=30)

    assert deleted == 5
    assert ids.limit.call_count == 3
    assert ids.limit.call_args_list == [call(2), call(2), call(2)]
    assert mock_audit_log.query.filter.return_value.delete.call_count == 3


@patch("backend.src.services.settings_service.RETENTION_BATCH_SIZE", 2)
@patch("backend.src.services.settings_service.RETENTION_MAX_BATCHES", 3)
@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.AuditLog")
def test_cleanup_old_audit_logs_stops_at_max_batches(mock_audit_log, mock_db):
    mock_audit_log.created_at = MagicMock()
    mock_audit_log.created_at.__lt__.return_value = True
    ids = _audit_id_chain(mock_db)
    ids.limit.return_value.all.return_value = [(1,), (2,)]

    deleted = settings_service.cleanup_old_audit_logs(retention_days=30)

    assert deleted == 6
    assert ids.limit.return_value.all.call_count == settings_service.RETENTION_MAX_BATCHES
    assert mock_audit_log.query.filter.return_value.delete.call_count == settings_service.RETENTION_MAX_BATCHES


@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.AuditLog")
def test_cleanup_old_audit_logs_dry_run_counts_without_deleting(mock_audit_log, mock_db):
    mock_audit_log.created_at = MagicMock()
    mock_audit_log.created_at.__lt__.return_value = True
    mock_audit_log.query.filter.return_value.count.return_value = 42

    deleted = settings_service.cleanup_old_audit_logs(retention_days=30, dry_run=True)

    assert deleted == 42
    mock_db.session.query.assert_not_called()
    mock_audit_log.query.filter.return_value.delete.assert_not_called()
    mock_db.session.commit.assert_not_called()
    mock_db.session.rollback.assert_not_called()


@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.AuditLog")
def test_cleanup_old_audit_logs_dry_run_count_is_capped(mock_audit_log, mock_db):
    mock_audit_log.created_at = MagicMock()
    mock_audit_log.created_at.__lt__.return_value = True
    mock_audit_log.query.filter.return_value.count.return_value = 10**9

    deleted = settings_service.cleanup_old_audit_logs(retention_days=30, dry_run=True)

    assert deleted == settings_service.RETENTION_BATCH_SIZE * settings_service.RETENTION_MAX_BATCHES


@patch("backend.src.services.settings_service.AuditLog")
def test_cleanup_old_audit_logs_non_positive_days_returns_zero(mock_audit_log):
    deleted = settings_service.cleanup_old_audit_logs(retention_days=0)
    assert deleted == 0
    mock_audit_log.query.filter.assert_not_called()


@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.AuditLog")
def test_cleanup_old_audit_logs_rolls_back_on_error(mock_audit_log, mock_db):
    mock_db.session.query.side_effect = Exception("db failed")

    deleted = settings_service.cleanup_old_audit_logs(retention_days=30)

    assert deleted == 0
    mock_db.session.rollback.assert_called_once()


@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.Task")
@patch("backend.src.services.settings_service.Notification")
@patch("backend.src.services.settings_service.Comment")
@patch("backend.src.services.settings_service.TaskGitHubLink")
@patch("backend.src.services.settings_service.Project")
def test_cleanup_completed_projects_happy_path(
    mock_project,
    mock_task_github_link,
    mock_comment,
    mock_notification,
    mock_task,
    mock_db,
):
    mock_project.status = MagicMock()
    mock_project.status.__eq__.return_value = True
    mock_project.updated_at = MagicMock()
    mock_project.updated_at.__lt__.return_value = True
    project = SimpleNamespace(id=1, tasks=[SimpleNamespace(id=11), SimpleNamespace(id=12)])
    batch = _project_batch(mock_project)
    batch.limit.return_value.all.side_effect = [[project], []]

    deleted = settings_service.cleanup_completed_projects(retention_days=30)

    assert deleted == 1
    batch.limit.assert_called_with(settings_service.RETENTION_BATCH_SIZE)
    mock_task_github_link.query.filter.return_value.delete.assert_called_once()
    mock_comment.query.filter.return_value.delete.assert_called_once()
    mock_notification.query.filter.return_value.delete.assert_called_once()
    mock_task.query.filter.return_value.delete.assert_called_once()
    mock_db.session.delete.assert_called_once_with(project)
    mock_db.session.commit.assert_called_once()


@patch("backend.src.services.settings_service.RETENTION_BATCH_SIZE", 2)
@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.Task")
@patch("backend.src.services.settings_service.Notification")
@patch("backend.src.services.settings_service.Comment")
@patch("backend.src.services.settings_service.TaskGitHubLink")
@patch("backend.src.services.settings_service.Project")
def test_cleanup_completed_projects_processes_bounded_batches(
    mock_project,
    mock_task_github_link,
    mock_comment,
    mock_notification,
    mock_task,
    mock_db,
):
    mock_project.status = MagicMock()
    mock_project.status.__eq__.return_value = True
    mock_project.updated_at = MagicMock()
    mock_project.updated_at.__lt__.return_value = True
    first = SimpleNamespace(id=1, tasks=[])
    second = SimpleNamespace(id=2, tasks=[])
    third = SimpleNamespace(id=3, tasks=[])
    batch = _project_batch(mock_project)
    batch.limit.return_value.all.side_effect = [[first, second], [third], []]

    deleted = settings_service.cleanup_completed_projects(retention_days=30)

    assert deleted == 3
    assert batch.limit.call_args_list == [call(2), call(2)]
    assert mock_db.session.delete.call_args_list == [call(first), call(second), call(third)]
    mock_db.session.commit.assert_called_once()


@patch("backend.src.services.settings_service.RETENTION_BATCH_SIZE", 2)
@patch("backend.src.services.settings_service.RETENTION_MAX_BATCHES", 3)
@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.Task")
@patch("backend.src.services.settings_service.Notification")
@patch("backend.src.services.settings_service.Comment")
@patch("backend.src.services.settings_service.TaskGitHubLink")
@patch("backend.src.services.settings_service.Project")
def test_cleanup_completed_projects_stops_at_max_batches(
    mock_project,
    mock_task_github_link,
    mock_comment,
    mock_notification,
    mock_task,
    mock_db,
):
    mock_project.status = MagicMock()
    mock_project.status.__eq__.return_value = True
    mock_project.updated_at = MagicMock()
    mock_project.updated_at.__lt__.return_value = True
    batch = _project_batch(mock_project)
    batch.limit.return_value.all.return_value = [SimpleNamespace(id=1, tasks=[]), SimpleNamespace(id=2, tasks=[])]

    deleted = settings_service.cleanup_completed_projects(retention_days=30)

    assert deleted == 2 * settings_service.RETENTION_MAX_BATCHES
    assert batch.limit.return_value.all.call_count == settings_service.RETENTION_MAX_BATCHES


@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.Project")
def test_cleanup_completed_projects_dry_run_counts_without_deleting(mock_project, mock_db):
    mock_project.status = MagicMock()
    mock_project.status.__eq__.return_value = True
    mock_project.updated_at = MagicMock()
    mock_project.updated_at.__lt__.return_value = True
    mock_project.query.filter.return_value.count.return_value = 9

    deleted = settings_service.cleanup_completed_projects(retention_days=30, dry_run=True)

    assert deleted == 9
    _project_batch(mock_project).limit.assert_not_called()
    mock_db.session.delete.assert_not_called()
    mock_db.session.commit.assert_not_called()
    mock_db.session.rollback.assert_not_called()


@patch("backend.src.services.settings_service.Project")
def test_cleanup_completed_projects_non_positive_days_returns_zero(mock_project):
    deleted = settings_service.cleanup_completed_projects(retention_days=0)
    assert deleted == 0
    mock_project.query.filter.assert_not_called()


@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.Project")
def test_cleanup_completed_projects_rolls_back_on_error(mock_project, mock_db):
    mock_project.query.filter.side_effect = Exception("db failed")

    deleted = settings_service.cleanup_completed_projects(retention_days=30)

    assert deleted == 0
    mock_db.session.rollback.assert_called_once()


@patch("backend.src.services.settings_service.cleanup_old_audit_logs", return_value=3)
@patch("backend.src.services.settings_service.cleanup_completed_projects", return_value=2)
def test_run_retention_cleanup_summary(mock_cleanup_projects, mock_cleanup_audit):
    summary = settings_service.run_retention_cleanup(audit_retention_days=14, project_retention_days=60)

    assert summary == {"audit_logs_deleted": 3, "projects_deleted": 2, "dry_run": False}
    mock_cleanup_audit.assert_called_once_with(14, dry_run=False)
    mock_cleanup_projects.assert_called_once_with(60, dry_run=False)


@patch("backend.src.services.settings_service.cleanup_old_audit_logs", return_value=11)
@patch("backend.src.services.settings_service.cleanup_completed_projects", return_value=4)
def test_run_retention_cleanup_forwards_dry_run(mock_cleanup_projects, mock_cleanup_audit):
    summary = settings_service.run_retention_cleanup(dry_run=True)

    assert summary == {"audit_logs_deleted": 11, "projects_deleted": 4, "dry_run": True}
    mock_cleanup_audit.assert_called_once_with(None, dry_run=True)
    mock_cleanup_projects.assert_called_once_with(None, dry_run=True)
