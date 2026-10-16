"""Teacher-provisioned accounts and login attempt tracking.

- users: username (students), must_change_password (one-time passwords),
  password_changed_at, created_by_id (which teacher/admin created the account), last_login_at
- auth_attempts: rate limiting data (keyed hashes only, no raw identifiers or IPs)

Existing users get must_change_password = false.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "auth_attempts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("ip_hash", sa.String(length=64), nullable=False),
        sa.Column("succeeded", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_auth_attempts"),
    )
    op.create_index("ix_auth_attempts_created_at", "auth_attempts", ["created_at"])
    op.create_index("ix_auth_attempts_ip_hash", "auth_attempts", ["ip_hash"])
    op.create_index("ix_auth_attempts_key_hash", "auth_attempts", ["key_hash"])

    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("username", sa.String(length=40), nullable=True))
        # server_default so existing rows get a value; NOT NULL is then safe.
        batch_op.add_column(sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("created_by_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_unique_constraint("uq_users_username", ["username"])
        batch_op.create_foreign_key("fk_users_created_by_id_users", "users", ["created_by_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("fk_users_created_by_id_users", type_="foreignkey")
        batch_op.drop_constraint("uq_users_username", type_="unique")
        batch_op.drop_column("last_login_at")
        batch_op.drop_column("created_by_id")
        batch_op.drop_column("password_changed_at")
        batch_op.drop_column("must_change_password")
        batch_op.drop_column("username")
    op.drop_index("ix_auth_attempts_key_hash", table_name="auth_attempts")
    op.drop_index("ix_auth_attempts_ip_hash", table_name="auth_attempts")
    op.drop_index("ix_auth_attempts_created_at", table_name="auth_attempts")
    op.drop_table("auth_attempts")
