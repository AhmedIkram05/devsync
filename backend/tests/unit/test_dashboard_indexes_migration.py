"""Migration a7c9e2b4f6d1: dashboard query indexes exist in models + migrate cleanly."""

import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

MIGRATION = (
    Path(__file__).resolve().parents[2] / "migrations" / "versions" / "a7c9e2b4f6d1_add_dashboard_query_indexes.py"
)

EXPECTED_INDEXES = [
    ("idx_tasks_project_id", "tasks", ["project_id"]),
    ("idx_tasks_project_status", "tasks", ["project_id", "status"]),
    ("idx_task_github_links_task_id", "task_github_links", ["task_id"]),
    ("idx_task_github_links_repo_id", "task_github_links", ["repo_id"]),
    ("idx_task_github_links_created_at", "task_github_links", ["created_at"]),
]


def _load_migration():
    spec = importlib.util.spec_from_file_location("dashboard_idx_migration", MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_chains_on_head():
    migration = _load_migration()
    assert migration.revision == "a7c9e2b4f6d1"
    assert migration.down_revision == "93a1f8b3c4d5"


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
    from backend.src.db.models.models import Task, TaskGitHubLink

    def index_names(model):
        return {idx.name for idx in model.__table_args__ if hasattr(idx, "name")}

    assert {name for name, _, _ in EXPECTED_INDEXES} <= index_names(Task) | index_names(TaskGitHubLink)
