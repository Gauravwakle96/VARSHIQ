"""Fresh and existing-schema migrations in an isolated SQLite test file."""
import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from app.database import Base


def test_migration_upgrade_backfill_roundtrip_and_frozen_snapshot(tmp_path):
    database = tmp_path / "AUTOMATED-TEST-migrations.db"
    backend = Path(__file__).resolve().parents[1]
    env = {**os.environ, "APP_ENV": "test", "DATABASE_URL": f"sqlite:///{database.as_posix()}"}

    def migrate(target):
        result = subprocess.run([sys.executable, "-m", "alembic", *target], cwd=backend, env=env,
                                capture_output=True, text=True, timeout=30)
        assert result.returncode == 0, result.stderr

    migrate(["upgrade", "0001"])
    engine = create_engine(f"sqlite:///{database.as_posix()}")
    with engine.begin() as connection:
        # A pre-existing property demonstrates that geographic columns backfill safely.
        connection.execute(text("INSERT INTO organisations(id,created_at,name) VALUES ('org',CURRENT_TIMESTAMP,'AUTOMATED TEST')"))
        connection.execute(text("INSERT INTO users(id,created_at,name,email,password_hash,role,organisation_id) VALUES "
                                "('owner',CURRENT_TIMESTAMP,'AUTOMATED TEST','migration@example.com','test-only','owner','org')"))
        connection.execute(text("INSERT INTO properties(id,created_at,property_code,owner_id,organisation_id,name,property_type,locality,"
                                "latitude,longitude,timezone,geometry_source,measurement_status,roof_material,coefficient_source,first_flush_mm,"
                                "collection_efficiency,tank_capacity_l,current_storage_l,daily_demand_l,storage_measured_at,storage_status,share_aggregate,notes) "
                                "VALUES ('prop',CURRENT_TIMESTAMP,'TEST-1','owner','org','AUTOMATED TEST','residential','Test',19,75,"
                                "'Asia/Kolkata','manual','unverified','other','',0,1,0,0,0,CURRENT_TIMESTAMP,'estimated',0,'')"))
    migrate(["upgrade", "head"])
    with engine.connect() as connection:
        assert set(Base.metadata.tables) <= set(inspect(connection).get_table_names())
        row = connection.execute(text("SELECT country,state,administrative_ids,parameters_updated_at FROM properties WHERE id='prop'")).one()
        assert row[0] == "IN" and row[1] == "" and row[2] == "{}" and row[3] is not None
    migrate(["downgrade", "base"])
    assert inspect(engine).get_table_names() == ["alembic_version"]
    migrate(["upgrade", "head"])
    assert set(Base.metadata.tables) <= set(inspect(engine).get_table_names())
    assert "Base.metadata" not in (backend / "alembic/versions/0001_initial.py").read_text()
    engine.dispose()
