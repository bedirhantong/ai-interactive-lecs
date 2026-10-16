"""Sync contract: notebook revisions, idempotent progress events, deduplicated reports.

- student_notebooks.revision (existing rows start at 1)
- progress_events.client_event_id + unique (user_id, client_event_id); old rows have NULL (allowed)
- training_reports.content_hash + unique (user_id, lesson_id, content_hash); old rows have NULL

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("student_notebooks") as batch_op:
        batch_op.add_column(sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    with op.batch_alter_table("progress_events") as batch_op:
        batch_op.add_column(sa.Column("client_event_id", sa.String(length=64), nullable=True))
        batch_op.create_unique_constraint("uq_progress_events_user_id_client_event_id", ["user_id", "client_event_id"])
    with op.batch_alter_table("training_reports") as batch_op:
        batch_op.add_column(sa.Column("content_hash", sa.String(length=64), nullable=True))
        batch_op.create_unique_constraint("uq_training_reports_user_id_lesson_id_content_hash", ["user_id", "lesson_id", "content_hash"])


def downgrade() -> None:
    with op.batch_alter_table("training_reports") as batch_op:
        batch_op.drop_constraint("uq_training_reports_user_id_lesson_id_content_hash", type_="unique")
        batch_op.drop_column("content_hash")
    with op.batch_alter_table("progress_events") as batch_op:
        batch_op.drop_constraint("uq_progress_events_user_id_client_event_id", type_="unique")
        batch_op.drop_column("client_event_id")
    with op.batch_alter_table("student_notebooks") as batch_op:
        batch_op.drop_column("revision")
