"""UTC round trips and duplicate submissions across real isolated DB sessions."""
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta, timezone
from threading import Barrier

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from test_api import fixture_property, signup
from test_operations import interval

from app.database import Base, get_db
from app.main import app
from app.models import WaterSource


def test_timestamp_offsets_are_preserved_across_fresh_sessions(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'AUTOMATED-TEST-offset.db').as_posix()}")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    local = datetime(2026, 1, 1, 12, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    with sessions() as db:
        row = WaterSource(property_id="fixture", user_id="fixture", source_type="municipal", volume_l=1,
                          interval_start=local, interval_end=local + timedelta(hours=1),
                          method="AUTOMATED TEST", reliability="measured")
        db.add(row)
        db.commit()
    with sessions() as db:
        stored = db.scalar(select(WaterSource))
        assert stored.interval_start == datetime(2026, 1, 1, 6, 30, tzinfo=UTC)
        assert stored.interval_start.isoformat() == "2026-01-01T06:30:00+00:00"
    engine.dispose()


def test_offset_equivalent_overlaps_are_rejected_and_maintenance_dates_are_utc(client, db_session):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    headers = {"X-CSRF-Token": csrf}
    body = interval(property_id=prop["id"], source_type="municipal",
                    interval_start="2026-01-01T12:00:00+05:30", interval_end="2026-01-01T13:00:00+05:30")
    assert client.post("/api/v1/water-sources/records", headers=headers, json=body).status_code == 201
    db_session.expire_all()
    equivalent = {**body, "interval_start": "2026-01-01T06:30:00Z", "interval_end": "2026-01-01T07:30:00Z"}
    assert client.post("/api/v1/water-sources/records", headers=headers, json=equivalent).status_code == 409
    maintenance = {"property_id": prop["id"], "task": "filter_cleaning", "condition": "good",
                   "performed_at": "2026-01-01T12:00:00+05:30", "next_due_at": "2026-01-02T12:00:00+05:30"}
    assert client.post("/api/v1/maintenance/records", headers=headers, json=maintenance).status_code == 201
    db_session.expire_all()
    row = client.get(f"/api/v1/maintenance/{prop['id']}").json()["data"]["records"][0]
    assert row["next_due_at"] == "2026-01-02T06:30:00+00:00"


def test_concurrent_duplicate_intervals_commit_only_once(client, tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'AUTOMATED-TEST-concurrency.db').as_posix()}",
                           connect_args={"check_same_thread": False, "timeout": 10})
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    previous = app.dependency_overrides[get_db]

    def connection():
        with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = connection
    try:
        csrf = signup(client)
        prop = fixture_property(client, csrf)
        body = interval(property_id=prop["id"], source_type="rainwater")
        barrier = Barrier(2)

        def submit():
            barrier.wait(timeout=10)
            return client.post("/api/v1/water-sources/records", headers={"X-CSRF-Token": csrf}, json=body).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: submit(), range(2)))
        assert sorted(results) == [201, 409]
        with sessions() as db:
            assert len(list(db.scalars(select(WaterSource)))) == 1
    finally:
        app.dependency_overrides[get_db] = previous
        engine.dispose()
