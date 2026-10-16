"""Use JSONB for JSON documents on PostgreSQL.

JSONB is stored in a binary form: faster to query, indexable, and smaller for
repeated keys. Existing rows are converted in place. No-op on other databases.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = [("student_notebooks", "state"), ("training_reports", "report")]


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table, column in COLUMNS:
        op.alter_column(
            table, column, type_=postgresql.JSONB(), existing_type=sa.JSON(), existing_nullable=False, postgresql_using=f"{column}::jsonb"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table, column in COLUMNS:
        op.alter_column(table, column, type_=sa.JSON(), existing_type=postgresql.JSONB(), existing_nullable=False, postgresql_using=f"{column}::json")
