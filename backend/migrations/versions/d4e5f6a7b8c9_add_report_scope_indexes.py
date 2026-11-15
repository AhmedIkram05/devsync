"""Add composite indexes for date-scoped report aggregation

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-11-15 00:00:01.000000

`GET /reports/data` filters tasks by scope (project/assignee) and a
`created_at` range, then groups. The existing single-column indexes serve the
equality side but force a sort/filter for the range; these composites serve
both clauses in one index.

Postgres-only guard mirrors c3d4e5f6a7b8 so the SQLite unit suite is a no-op.
"""

import sqlalchemy as sa  # noqa: F401  (kept for autogenerate parity with sibling revisions)
from alembic import op

# revision identifiers, used by Alembic.
revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None

REPORT_SCOPE_INDEXES = (
    ("idx_tasks_project_created", "tasks", ["project_id", "created_at"]),
    ("idx_tasks_assigned_created", "tasks", ["assigned_to", "created_at"]),
)


def _is_postgresql():
    return op.get_bind().dialect.name == "postgresql"


def upgrade():
    if not _is_postgresql():
        return
    for name, table, columns in REPORT_SCOPE_INDEXES:
        op.create_index(name, table, columns, unique=False)


def downgrade():
    if not _is_postgresql():
        return
    for name, table, _columns in reversed(REPORT_SCOPE_INDEXES):
        op.drop_index(name, table_name=table)
