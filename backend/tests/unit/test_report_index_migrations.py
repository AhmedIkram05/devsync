"""Migrations c3d4e5f6a7b8 (trigram) and d4e5f6a7b8c9 (report scope) are correct
and dialect-safe.

The SQLite unit suite never executes these migrations, so the assertions below
pin the exact DDL the Postgres migrate Job will run.
"""

import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

VERSIONS = Path(__file__).resolve().parents[2] / "migrations" / "versions"

TRIGRAM_INDEXES = {
    ("idx_tasks_title_trgm", "tasks", "title"),
    ("idx_projects_name_trgm", "projects", "name"),
    ("idx_users_name_trgm", "users", "name"),
    ("idx_users_email_trgm", "users", "email"),
    ("idx_audit_logs_action_trgm", "audit_logs", "action"),
}

REPORT_INDEXES = {
    ("idx_tasks_project_created", "tasks", ("project_id", "created_at")),
    ("idx_tasks_assigned_created", "tasks", ("assigned_to", "created_at")),
}


def _load(filename, name):
    spec = importlib.util.spec_from_file_location(name, VERSIONS / filename)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _mock_op(dialect="postgresql"):
    mock_op = MagicMock()
    mock_op.get_bind.return_value.dialect.name = dialect
    return mock_op


def test_trigram_migration_chains_on_head():
    migration = _load("c3d4e5f6a7b8_add_trigram_search_indexes.py", "trigram_migration")
    assert migration.revision == "c3d4e5f6a7b8"
    assert migration.down_revision == "f1a2b3c4d5e6"


def test_report_scope_migration_chains_on_trigram():
    migration = _load("d4e5f6a7b8c9_add_report_scope_indexes.py", "report_scope_migration")
    assert migration.revision == "d4e5f6a7b8c9"
    assert migration.down_revision == "c3d4e5f6a7b8"


def test_trigram_upgrade_creates_extension_and_gin_indexes_on_postgres():
    migration = _load("c3d4e5f6a7b8_add_trigram_search_indexes.py", "trigram_upgrade")
    migration.op = _mock_op("postgresql")

    migration.upgrade()

    migration.op.execute.assert_called_once_with("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    created = {(call.args[0], call.args[1], call.args[2][0]) for call in migration.op.create_index.call_args_list}
    assert created == TRIGRAM_INDEXES
    for call in migration.op.create_index.call_args_list:
        assert call.kwargs["postgresql_using"] == "gin"
        column = call.args[2][0]
        assert call.kwargs["postgresql_ops"] == {column: "gin_trgm_ops"}


def test_trigram_upgrade_is_a_noop_on_sqlite():
    migration = _load("c3d4e5f6a7b8_add_trigram_search_indexes.py", "trigram_sqlite")
    migration.op = _mock_op("sqlite")

    migration.upgrade()

    migration.op.execute.assert_not_called()
    migration.op.create_index.assert_not_called()


def test_trigram_downgrade_drops_indexes_but_keeps_extension():
    migration = _load("c3d4e5f6a7b8_add_trigram_search_indexes.py", "trigram_downgrade")
    migration.op = _mock_op("postgresql")

    migration.downgrade()

    dropped = {(call.args[0], call.kwargs["table_name"]) for call in migration.op.drop_index.call_args_list}
    assert dropped == {(name, table) for name, table, _column in TRIGRAM_INDEXES}
    migration.op.execute.assert_not_called()


def test_report_scope_upgrade_creates_composites_on_postgres():
    migration = _load("d4e5f6a7b8c9_add_report_scope_indexes.py", "report_scope_upgrade")
    migration.op = _mock_op("postgresql")

    migration.upgrade()

    created = {(call.args[0], call.args[1], tuple(call.args[2])) for call in migration.op.create_index.call_args_list}
    assert created == REPORT_INDEXES


def test_report_scope_upgrade_is_a_noop_on_sqlite():
    migration = _load("d4e5f6a7b8c9_add_report_scope_indexes.py", "report_scope_sqlite")
    migration.op = _mock_op("sqlite")

    migration.upgrade()

    migration.op.create_index.assert_not_called()


def test_report_scope_downgrade_drops_composites():
    migration = _load("d4e5f6a7b8c9_add_report_scope_indexes.py", "report_scope_downgrade")
    migration.op = _mock_op("postgresql")

    migration.downgrade()

    dropped = {(call.args[0], call.kwargs["table_name"]) for call in migration.op.drop_index.call_args_list}
    assert dropped == {(name, table) for name, table, _columns in REPORT_INDEXES}
