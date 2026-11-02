"""Shared request limits for the optional serverless deployment."""
import sqlalchemy as sa

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("request_rate_limits",
                    sa.Column("key", sa.String(64), primary_key=True),
                    sa.Column("count", sa.Integer(), nullable=False),
                    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_request_rate_limits_expires_at", "request_rate_limits", ["expires_at"])


def downgrade():
    op.drop_index("ix_request_rate_limits_expires_at", table_name="request_rate_limits")
    op.drop_table("request_rate_limits")
