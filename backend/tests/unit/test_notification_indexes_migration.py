"""Migration b5e8a7c3d9f2: notification composite indexes exist in models + migrate cleanly."""

import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "versions"
    / "b5e8a7c3d9f2_add_notification_composite_indexes.py"
)

EXPECTED_INDEXES = [
    ("idx_notifications_user_read", "notifications", ["user_id", "is_read"]),
    ("idx_notifications_user_task", "notifications", ["user_id", "task_id"]),
]


def _load_migration():
    spec = importlib.util.spec_from_file_location("notification_idx_migration", MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_chains_on_head():
    migration = _load_migration()
    assert migration.revision == "b5e8a7c3d9f2"
    assert migration.down_revision == "a7c9e2b4f6d1"


def test_migration_upgrade_creates_all_indexes():
    migration = _load_migration()
    mock_op = MagicMock()
    migration.op = mock_op
    migration.upgrade()
    created = {(c.args[0], c.args[1], tuple(c.args[2])) for c in mock_op.create_index.call_args_list}
    assert created == {(name, table, tuple(cols)) for name, table, cols in EXPECTED_INDEXES}


def test_migration_downgrade_drops_all_indexes():
    migration = _load_migration()
    mock_op = MagicMock()
    migration.op = mock_op
    migration.downgrade()
    dropped = {c.args[0] for c in mock_op.drop_index.call_args_list}
    assert dropped == {name for name, _, _ in EXPECTED_INDEXES}


def test_models_declare_matching_indexes():
    from backend.src.db.models.models import Notification

    index_names = {idx.name for idx in Notification.__table_args__ if hasattr(idx, "name")}

    assert {name for name, _, _ in EXPECTED_INDEXES} <= index_names
