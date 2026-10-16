"""Audit events: who accessed or changed whose data (KVKK accountability).

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("actor_role", sa.String(length=16), nullable=True),
        sa.Column("subject_id", sa.Uuid(), nullable=True),
        sa.Column("classroom_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_audit_events"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], name="fk_audit_events_actor_id_users", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subject_id"], ["users.id"], name="fk_audit_events_subject_id_users", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], name="fk_audit_events_classroom_id_classrooms", ondelete="SET NULL"),
    )
    op.create_index("ix_audit_events_action", "audit_events", ["action"])
    op.create_index("ix_audit_events_actor_id", "audit_events", ["actor_id"])
    op.create_index("ix_audit_events_subject_id", "audit_events", ["subject_id"])
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])


def downgrade() -> None:
    for name in ("ix_audit_events_created_at", "ix_audit_events_subject_id", "ix_audit_events_actor_id", "ix_audit_events_action"):
        op.drop_index(name, table_name="audit_events")
    op.drop_table("audit_events")
