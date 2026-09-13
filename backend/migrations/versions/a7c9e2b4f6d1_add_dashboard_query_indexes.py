"""Add dashboard query indexes (tasks.project_id, link-table FKs)

Revision ID: a7c9e2b4f6d1
Revises: 93a1f8b3c4d5
Create Date: 2026-09-13 00:00:00.000000

Dashboard endpoints filter by Task.project_id and join TaskGitHubLink on
every load; without these the queries fall back to seq scans as the tables
grow. Plain CREATE INDEX (not CONCURRENTLY): tables are small and the
migrate Job runs pre-rollout, so no long lock risk.
"""

import sqlalchemy as sa  # noqa: F401  (kept for autogenerate parity with sibling revisions)
from alembic import op

# revision identifiers, used by Alembic.
revision = "a7c9e2b4f6d1"
down_revision = "93a1f8b3c4d5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("idx_tasks_project_id", "tasks", ["project_id"], unique=False)
    op.create_index("idx_tasks_project_status", "tasks", ["project_id", "status"], unique=False)
    op.create_index("idx_task_github_links_task_id", "task_github_links", ["task_id"], unique=False)
    op.create_index("idx_task_github_links_repo_id", "task_github_links", ["repo_id"], unique=False)
    op.create_index("idx_task_github_links_created_at", "task_github_links", ["created_at"], unique=False)


def downgrade():
    op.drop_index("idx_task_github_links_created_at", table_name="task_github_links")
    op.drop_index("idx_task_github_links_repo_id", table_name="task_github_links")
    op.drop_index("idx_task_github_links_task_id", table_name="task_github_links")
    op.drop_index("idx_tasks_project_status", table_name="tasks")
    op.drop_index("idx_tasks_project_id", table_name="tasks")
