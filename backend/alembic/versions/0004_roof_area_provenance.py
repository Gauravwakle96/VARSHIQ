"""Separate confirmed map estimates from field measurements; preserve existing records."""
import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("properties", sa.Column("roof_area_provenance", sa.JSON(), nullable=False, server_default="{}"))


def downgrade():
    with op.batch_alter_table("properties") as batch:
        batch.drop_column("roof_area_provenance")
