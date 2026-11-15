"""Add pg_trgm extension and trigram indexes for ILIKE search

Revision ID: c3d4e5f6a7b8
Revises: f1a2b3c4d5e6
Create Date: 2026-11-15 00:00:00.000000

The four user-facing search paths use leading-wildcard ILIKE
(`tasks.title`, `projects.name`, `users.name`, `users.email`,
`audit_logs.action`), which no btree index can serve. `pg_trgm` GIN indexes
make those substring matches index scans instead of seq scans.

Postgres-only: SQLite (unit tests) has no pg_trgm, so the whole upgrade is a
no-op there. Plain CREATE INDEX (not CONCURRENTLY) matches sibling migrations:
tables are small and the migrate Job runs pre-rollout.

Downgrade drops the indexes and deliberately leaves the extension installed -
dropping a shared extension is hostile to any other index that may use it.
"""

import sqlalchemy as sa  # noqa: F401  (kept for autogenerate parity with sibling revisions)
from alembic import op

# revision identifiers, used by Alembic.
revision = "c3d4e5f6a7b8"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None

TRIGRAM_INDEXES = (
    ("idx_tasks_title_trgm", "tasks", "title"),
    ("idx_projects_name_trgm", "projects", "name"),
    ("idx_users_name_trgm", "users", "name"),
    ("idx_users_email_trgm", "users", "email"),
    ("idx_audit_logs_action_trgm", "audit_logs", "action"),
)


def _is_postgresql():
    return op.get_bind().dialect.name == "postgresql"


def upgrade():
    if not _is_postgresql():
        return
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    for name, table, column in TRIGRAM_INDEXES:
        op.create_index(
            name,
            table,
            [column],
            unique=False,
            postgresql_using="gin",
            postgresql_ops={column: "gin_trgm_ops"},
        )


def downgrade():
    if not _is_postgresql():
        return
    for name, table, _column in reversed(TRIGRAM_INDEXES):
        op.drop_index(name, table_name=table)
