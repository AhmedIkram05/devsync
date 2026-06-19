from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.src.services import settings_service


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
    assert settings_service.get_bool_setting("allow_self_registration", default=True) is False


@patch("backend.src.services.settings_service.get_settings", return_value={"audit_log_retention_days": "15"})
def test_get_int_setting_uses_default_and_normalization(mock_get_settings):
    assert settings_service.get_int_setting("audit_log_retention_days", default=5) == 15


@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.AuditLog")
def test_cleanup_old_audit_logs_happy_path(mock_audit_log, mock_db):
    mock_audit_log.created_at = MagicMock()
    mock_audit_log.created_at.__lt__.return_value = True
    mock_audit_log.query.filter.return_value.delete.return_value = 7

    deleted = settings_service.cleanup_old_audit_logs(retention_days=30)

    assert deleted == 7
    mock_db.session.commit.assert_called_once()


@patch("backend.src.services.settings_service.AuditLog")
def test_cleanup_old_audit_logs_non_positive_days_returns_zero(mock_audit_log):
    deleted = settings_service.cleanup_old_audit_logs(retention_days=0)
    assert deleted == 0
    mock_audit_log.query.filter.assert_not_called()


@patch("backend.src.services.settings_service.db")
@patch("backend.src.services.settings_service.AuditLog")
def test_cleanup_old_audit_logs_rolls_back_on_error(mock_audit_log, mock_db):
    mock_audit_log.query.filter.side_effect = Exception("db failed")

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
    mock_project.query.filter.return_value.all.return_value = [project]

    deleted = settings_service.cleanup_completed_projects(retention_days=30)

    assert deleted == 1
    mock_task_github_link.query.filter.return_value.delete.assert_called_once()
    mock_comment.query.filter.return_value.delete.assert_called_once()
    mock_notification.query.filter.return_value.delete.assert_called_once()
    mock_task.query.filter.return_value.delete.assert_called_once()
    mock_db.session.delete.assert_called_once_with(project)
    mock_db.session.commit.assert_called_once()


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

    assert summary == {"audit_logs_deleted": 3, "projects_deleted": 2}
    mock_cleanup_audit.assert_called_once_with(14)
    mock_cleanup_projects.assert_called_once_with(60)
