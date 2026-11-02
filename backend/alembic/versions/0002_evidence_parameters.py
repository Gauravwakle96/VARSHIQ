"""Retain observation parameter versions and invalidate superseded modelling inputs."""
import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("properties", sa.Column("parameters_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE properties SET parameters_updated_at = created_at WHERE parameters_updated_at IS NULL")
    with op.batch_alter_table("properties") as batch:
        batch.alter_column("parameters_updated_at", nullable=False, existing_type=sa.DateTime(timezone=True))
    op.add_column("rainfall_observations", sa.Column("parameter_snapshot", sa.JSON(),
                  server_default=sa.text("'{}'"), nullable=False))


def downgrade():
    op.drop_column("rainfall_observations", "parameter_snapshot")
    op.drop_column("properties", "parameters_updated_at")
