"""Migration 93a1f8b3c4d5: audit_logs + system_settings tables and the Postgres-only role check.

The suite runs on SQLite (in CI too), so the `bind.dialect.name == "postgresql"`
branches in this migration were never executed by any test. These exercise both
the Postgres and the non-Postgres path directly.
"""

import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "versions"
    / "93a1f8b3c4d5_add_audit_logs_and_system_settings.py"
)

ROLE_CHECK_SQL = "role IN ('developer', 'team_lead', 'admin')"

SEEDED_KEYS = {
    "app_name",
    "allow_registration",
    "default_user_role",
    "github_integration_enabled",
    "notification_settings",
}


def _load_migration():
    spec = importlib.util.spec_from_file_location("audit_settings_migration", MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _mock_op(dialect):
    """op stand-in whose get_bind().dialect.name reports the given dialect."""
    mock_op = MagicMock()
    mock_op.get_bind.return_value.dialect.name = dialect
    return mock_op


def test_migration_chains_on_head():
    migration = _load_migration()
    assert migration.revision == "93a1f8b3c4d5"
    assert migration.down_revision == "e2f4g5h6i7j8"


def test_upgrade_creates_both_tables():
    migration = _load_migration()
    mock_op = _mock_op("sqlite")
    migration.op = mock_op
    migration.upgrade()
    assert {call.args[0] for call in mock_op.create_table.call_args_list} == {"audit_logs", "system_settings"}


def test_upgrade_seeds_default_system_settings():
    migration = _load_migration()
    mock_op = _mock_op("sqlite")
    migration.op = mock_op
    migration.upgrade()
    rows = mock_op.bulk_insert.call_args.args[1]
    assert {row["key"] for row in rows} == SEEDED_KEYS


def test_upgrade_creates_role_check_constraint_on_postgres():
    migration = _load_migration()
    mock_op = _mock_op("postgresql")
    migration.op = mock_op
    migration.upgrade()
    mock_op.create_check_constraint.assert_called_once_with("check_valid_role", "users", ROLE_CHECK_SQL)


def test_upgrade_skips_role_check_constraint_off_postgres():
    migration = _load_migration()
    mock_op = _mock_op("sqlite")
    migration.op = mock_op
    migration.upgrade()
    mock_op.create_check_constraint.assert_not_called()


def test_downgrade_drops_role_check_constraint_on_postgres():
    migration = _load_migration()
    mock_op = _mock_op("postgresql")
    migration.op = mock_op
    migration.downgrade()
    mock_op.drop_constraint.assert_called_once_with("check_valid_role", "users", type_="check")


def test_downgrade_skips_drop_constraint_off_postgres():
    migration = _load_migration()
    mock_op = _mock_op("sqlite")
    migration.op = mock_op
    migration.downgrade()
    mock_op.drop_constraint.assert_not_called()
