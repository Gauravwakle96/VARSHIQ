"""CI-only PostGIS target check. Synthetic geometry remains in a temporary table."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from sqlalchemy import inspect, text

from app import models  # noqa: F401
from app.database import Base, engine
from app.services.geometry import assess_geometry


def main():
    if engine.dialect.name != "postgresql":
        raise RuntimeError("This target check requires PostgreSQL/PostGIS; SQLite cannot pass it")
    # Clearly labelled synthetic polygon, only for this isolated CI test.
    geometry = {
        "type": "Polygon",
        "coordinates": [[[72.8770, 19.0760], [72.8780, 19.0760], [72.8780, 19.0770],
                         [72.8770, 19.0770], [72.8770, 19.0760]]],
    }
    expected = assess_geometry(geometry)["area_m2"]
    with engine.begin() as connection:
        version = connection.execute(text("SELECT PostGIS_Version()")).scalar_one()
        tables = set(inspect(connection).get_table_names())
        missing = set(Base.metadata.tables) - tables
        if missing:
            raise AssertionError(f"Migration omitted required tables: {sorted(missing)}")
        column_type = connection.execute(text(
            "SELECT udt_name FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name='building_footprints' "
            "AND column_name='spatial_geometry'"
        )).scalar_one()
        if column_type != "geometry":
            raise AssertionError("Building footprint spatial column is not native PostGIS geometry")
        connection.execute(text(
            "CREATE TEMP TABLE varshiq_geometry_probe (geom geometry(MultiPolygon,4326)) ON COMMIT DROP"
        ))
        connection.execute(text(
            "INSERT INTO varshiq_geometry_probe(geom) "
            "VALUES (ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:geometry),4326)))"
        ), {"geometry": json.dumps(geometry)})
        srid, valid, area = connection.execute(text(
            "SELECT ST_SRID(geom), ST_IsValid(geom), ST_Area(geom::geography) FROM varshiq_geometry_probe"
        )).one()
        if srid != 4326 or not valid or abs(area-expected) > expected*.01:
            raise AssertionError("PostGIS geometry/SRID/geodesic-area validation failed")
        print(f"Verified PostGIS {version}; {len(tables)} tables; valid EPSG:4326 area {area:.2f} m²")


if __name__ == "__main__":
    main()
