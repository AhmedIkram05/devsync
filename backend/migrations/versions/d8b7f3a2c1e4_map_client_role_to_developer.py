"""Map legacy client role rows to developer.

Revision ID: d8b7f3a2c1e4
Revises: 60bf05e33475
Create Date: 2026-05-04 00:00:00.000000
"""

from alembic import op


revision = 'd8b7f3a2c1e4'
down_revision = '60bf05e33475'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE users SET role = 'developer' WHERE role = 'client'")


def downgrade():
    # Role history is not retained, so this migration cannot be reversed safely.
    pass
