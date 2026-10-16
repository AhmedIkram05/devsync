"""Tests for the scheduled maintenance service (P1.2)."""

from src.services import maintenance_service


def test_run_scheduled_maintenance_returns_counts(monkeypatch):
    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_old_audit_logs", lambda: 5)
    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_completed_projects", lambda: 2)

    summary = maintenance_service.run_scheduled_maintenance()

    assert summary == {"audit_logs_deleted": 5, "projects_deleted": 2, "errors": []}


def test_run_scheduled_maintenance_isolates_task_failure(monkeypatch):
    def boom():
        raise RuntimeError("audit cleanup exploded")

    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_old_audit_logs", boom)
    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_completed_projects", lambda: 3)

    summary = maintenance_service.run_scheduled_maintenance()

    assert summary["audit_logs_deleted"] == 0
    assert summary["projects_deleted"] == 3
    assert summary["errors"] == [{"audit_logs_deleted": "audit cleanup exploded"}]


def test_run_scheduled_maintenance_none_counts_as_zero(monkeypatch):
    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_old_audit_logs", lambda: None)
    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_completed_projects", lambda: None)

    summary = maintenance_service.run_scheduled_maintenance()

    assert summary["audit_logs_deleted"] == 0
    assert summary["projects_deleted"] == 0
    assert summary["errors"] == []
