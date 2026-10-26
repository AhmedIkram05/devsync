"""Add notification composite indexes (user_id,is_read) and (user_id,task_id)

Revision ID: b5e8a7c3d9f2
Revises: a7c9e2b4f6d1
Create Date: 2026-10-25 00:00:00.000000

The notification list endpoint counts unread rows per user on every request
and the task list runs one dedup SELECT per overdue task; both filter on
user_id first. Plain CREATE INDEX (not CONCURRENTLY), same rationale as the
dashboard-index revision: tables are small and the migrate Job runs pre-rollout.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "b5e8a7c3d9f2"
down_revision = "a7c9e2b4f6d1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("idx_notifications_user_read", "notifications", ["user_id", "is_read"], unique=False)
    op.create_index("idx_notifications_user_task", "notifications", ["user_id", "task_id"], unique=False)


def downgrade():
    op.drop_index("idx_notifications_user_task", table_name="notifications")
    op.drop_index("idx_notifications_user_read", table_name="notifications")
