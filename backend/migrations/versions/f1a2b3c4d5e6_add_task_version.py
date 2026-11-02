"""Add version column to tasks for optimistic concurrency control

Revision ID: f1a2b3c4d5e6
Revises: b5e8a7c3d9f2
Create Date: 2026-11-01 00:00:00.000000

Task updates were last-write-wins: two clients editing the same task (e.g. a
concurrent reassignment) silently clobbered each other. The version column
backs a conditional UPDATE ... WHERE id = :id AND version = :expected that the
controller enforces only when the client supplies the version it last read, so
existing clients keep working. batch_alter keeps the add non-destructive and
portable to SQLite (test/dev) as well as Postgres; server_default="1" backfills
existing rows.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f1a2b3c4d5e6"
down_revision = "b5e8a7c3d9f2"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("version", sa.Integer(), nullable=False, server_default="1"))


def downgrade():
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("version")
