"""Tests for the scheduled maintenance service (P1.2)."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from src.services import maintenance_service


def test_run_scheduled_maintenance_returns_counts(monkeypatch):
    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_old_audit_logs", lambda dry_run=False: 5)
    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_completed_projects", lambda dry_run=False: 2)

    summary = maintenance_service.run_scheduled_maintenance()

    assert summary == {"audit_logs_deleted": 5, "projects_deleted": 2, "errors": [], "dry_run": False}


def test_run_scheduled_maintenance_forwards_dry_run(monkeypatch):
    calls = []

    def record(name, count):
        def task(dry_run=False):
            calls.append((name, dry_run))
            return count

        return task

    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_old_audit_logs", record("audit", 5))
    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_completed_projects", record("projects", 2))

    summary = maintenance_service.run_scheduled_maintenance(dry_run=True)

    assert summary == {"audit_logs_deleted": 5, "projects_deleted": 2, "errors": [], "dry_run": True}
    assert calls == [("audit", True), ("projects", True)]


def test_run_scheduled_maintenance_dry_run_commits_nothing(monkeypatch):
    """Dry run reports counts through the real cleanups without committing."""
    committed = []

    class FakeSession:
        def commit(self):
            committed.append(True)

        def rollback(self):
            pass

    monkeypatch.setattr(
        maintenance_service.settings_service,
        "db",
        SimpleNamespace(session=FakeSession()),
    )
    monkeypatch.setattr(maintenance_service.settings_service, "AuditLog", _FakeAuditLog(cutoff_matches=7))
    monkeypatch.setattr(maintenance_service.settings_service, "Project", _FakeProject())

    summary = maintenance_service.run_scheduled_maintenance(dry_run=True)

    assert summary == {
        "audit_logs_deleted": 7,
        "projects_deleted": 2,
        "errors": [],
        "dry_run": True,
    }
    assert committed == []


def test_run_scheduled_maintenance_isolates_task_failure(monkeypatch):
    def boom(dry_run=False):
        raise RuntimeError("audit cleanup exploded")

    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_old_audit_logs", boom)
    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_completed_projects", lambda dry_run=False: 3)

    summary = maintenance_service.run_scheduled_maintenance()

    assert summary["audit_logs_deleted"] == 0
    assert summary["projects_deleted"] == 3
    assert summary["errors"] == [{"audit_logs_deleted": "audit cleanup exploded"}]


def test_run_scheduled_maintenance_none_counts_as_zero(monkeypatch):
    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_old_audit_logs", lambda dry_run=False: None)
    monkeypatch.setattr(maintenance_service.settings_service, "cleanup_completed_projects", lambda dry_run=False: None)

    summary = maintenance_service.run_scheduled_maintenance()

    assert summary["audit_logs_deleted"] == 0
    assert summary["projects_deleted"] == 0
    assert summary["errors"] == []


def test_run_maintenance_script_forwards_dry_run_flag(monkeypatch, capsys):
    from src.db.scripts import run_maintenance

    calls = {}

    class FakeApp:
        class _Ctx:
            def __enter__(self_inner):
                return None

            def __exit__(self_inner, *exc):
                return False

        def app_context(self_inner):
            return self_inner._Ctx()

    def fake_maintenance(dry_run=False):
        calls["dry_run"] = dry_run
        return {"audit_logs_deleted": 1, "projects_deleted": 0, "errors": [], "dry_run": dry_run}

    monkeypatch.setattr("src.app.create_app", lambda: (FakeApp(), None))
    monkeypatch.setattr("src.services.maintenance_service.run_scheduled_maintenance", fake_maintenance)

    run_maintenance.main(["--dry-run"])

    assert calls["dry_run"] is True
    assert "dry_run=True" in capsys.readouterr().out


def test_run_maintenance_script_defaults_to_real_run(monkeypatch, capsys):
    from src.db.scripts import run_maintenance

    calls = {}

    class FakeApp:
        class _Ctx:
            def __enter__(self_inner):
                return None

            def __exit__(self_inner, *exc):
                return False

        def app_context(self_inner):
            return self_inner._Ctx()

    def fake_maintenance(dry_run=False):
        calls["dry_run"] = dry_run
        return {"audit_logs_deleted": 0, "projects_deleted": 0, "errors": [], "dry_run": dry_run}

    monkeypatch.setattr("src.app.create_app", lambda: (FakeApp(), None))
    monkeypatch.setattr("src.services.maintenance_service.run_scheduled_maintenance", fake_maintenance)

    run_maintenance.main([])

    assert calls["dry_run"] is False
    assert "dry_run=False" in capsys.readouterr().out


def test_run_maintenance_script_exits_nonzero_on_errors(monkeypatch):
    from src.db.scripts import run_maintenance

    class FakeApp:
        class _Ctx:
            def __enter__(self_inner):
                return None

            def __exit__(self_inner, *exc):
                return False

        def app_context(self_inner):
            return self_inner._Ctx()

    monkeypatch.setattr("src.app.create_app", lambda: (FakeApp(), None))
    monkeypatch.setattr(
        "src.services.maintenance_service.run_scheduled_maintenance",
        lambda dry_run=False: {"audit_logs_deleted": 0, "projects_deleted": 0, "errors": ["boom"], "dry_run": False},
    )

    try:
        run_maintenance.main([])
    except SystemExit as exc:
        assert exc.code == 1
    else:
        raise AssertionError("expected SystemExit(1)")


class _FakeAuditLog:
    """AuditLog stand-in that only answers the dry-run COUNT query."""

    def __init__(self, cutoff_matches):
        self.id = MagicMock()
        self.created_at = MagicMock()
        self.created_at.__lt__ = MagicMock(return_value="expired")
        self.query = MagicMock()
        self.query.filter.return_value.count.return_value = cutoff_matches


class _FakeProject:
    """Project stand-in that only answers the dry-run COUNT query."""

    status = MagicMock()
    updated_at = MagicMock()
    query = MagicMock()

    def __init__(self):
        self.status.__eq__ = MagicMock(return_value="completed")
        self.updated_at.__lt__ = MagicMock(return_value="expired")
        self.query.filter.return_value.count.return_value = 2
