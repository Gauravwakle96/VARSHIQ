"""Synthetic owner records, quotations and provider data in isolated test storage only."""
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError
from test_api import fixture_property, signup

from app.models import Property, RainfallObservation, now
from app.operations_schemas import CommunityBudget, Maintenance, Quality, SourceRecord
from app.services.evidence import roof_parameters


def interval(**extra):
    end = datetime.now(UTC) - timedelta(hours=2)
    return {"volume_l": 125, "interval_start": (end - timedelta(hours=1)).isoformat(),
            "interval_end": end.isoformat(), "method": "AUTOMATED TEST meter", "reliability": "measured", **extra}


def test_location_metadata_and_storage_date_round_trip(client):
    csrf = signup(client)
    measured = (now() - timedelta(hours=2)).isoformat()
    prop = fixture_property(client, csrf, property_type="apartment", state="Maharashtra",
                            district="Chhatrapati Sambhajinagar", city="Chhatrapati Sambhajinagar",
                            locality="AUTOMATED TEST CIDCO", latitude=19.87, longitude=75.34,
                            postcode="431003", location_source="osm", administrative_ids={"osm_place": "R:123"},
                            storage_measured_at=measured)
    assert prop["property_code"].startswith("MH-PROP-")
    assert prop["storage_measured_at"] == measured
    response = client.patch(f"/api/v1/buildings/{prop['id']}", headers={"X-CSRF-Token": csrf},
                            json={"country": "IN", "state": "Maharashtra", "city": "Pune",
                                  "storage_measured_at": measured})
    assert response.status_code == 200
    assert response.json()["data"]["administrative_ids"] == {"osm_place": "R:123"}
    assert client.get("/api/v1/dashboard/locality?property_type=apartment").json()["data"]["apartment_count"] == 1


def test_source_consumption_persist_overlap_and_provenance(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    headers = {"X-CSRF-Token": csrf}
    body = interval(property_id=prop["id"], source_type="municipal")
    assert client.post("/api/v1/water-sources/records", headers=headers, json=body).status_code == 201
    assert client.post("/api/v1/water-sources/records", headers=headers, json=body).status_code == 409
    assert client.post("/api/v1/water-sources/records", headers=headers,
                       json={**body, "source_type": "tanker", "reliability": "estimated"}).status_code == 201
    consumed = interval(property_id=prop["id"], use_type="gardening", volume_l=80)
    assert client.post("/api/v1/consumption/records", headers=headers, json=consumed).status_code == 201
    assert client.post("/api/v1/consumption/records", headers=headers, json=consumed).status_code == 409
    ledger = client.get(f"/api/v1/water-sources/{prop['id']}").json()["data"]
    assert ledger["totals"] == {"supply_l": 250, "consumption_l": 80}
    assert ledger["by_source"] == {"municipal": 125, "tanker": 125}
    assert {row["reliability"] for row in ledger["sources"]} == {"estimated", "measured"}
    assert client.get(f"/api/v1/buildings/{prop['id']}").json()["data"]["daily_demand_l"] == 100


def test_reporting_window_does_not_prorate_straddling_meter_interval(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    body = interval(property_id=prop["id"], source_type="municipal",
                    interval_start=(now() - timedelta(days=35)).isoformat())
    assert client.post("/api/v1/water-sources/records", headers={"X-CSRF-Token": csrf}, json=body).status_code == 201
    result = client.get(f"/api/v1/water-sources/{prop['id']}?days=30").json()["data"]
    assert result["boundary_records_excluded"] == 1
    assert result["totals"]["supply_l"] == 0
    assert client.get(f"/api/v1/water-sources/{prop['id']}?days=90").json()["data"]["totals"]["supply_l"] == 125


@pytest.mark.parametrize("change", [
    {"volume_l": -1}, {"volume_l": float("inf")},
    {"interval_start": datetime(2026, 1, 1)},
    {"interval_end": now() + timedelta(days=1)},
    {"interval_start": now()}, {"reliability": "field_verified"},
])
def test_volume_records_reject_invalid_measurements(change):
    with pytest.raises(ValidationError):
        SourceRecord(**interval(property_id="test", source_type="rainwater", **change))


def test_private_operation_records_and_empty_groundwater(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    missing = client.get(f"/api/v1/groundwater/{prop['id']}").json()["data"]
    assert missing["status"] == "unavailable" and missing["groundwater"] == [] and missing["soil"] == []
    client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})
    csrf = signup(client, "other-operations@example.com")
    for path in ("water-sources", "maintenance", "water-quality", "groundwater", "watertwin"):
        assert client.get(f"/api/v1/{path}/{prop['id']}").status_code == 404
    body = interval(property_id=prop["id"], source_type="tanker")
    assert client.post("/api/v1/water-sources/records", headers={"X-CSRF-Token": csrf}, json=body).status_code == 404


def test_quality_persistence_requires_actual_parameters(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    body = {"property_id": prop["id"], "tested_at": (now() - timedelta(hours=1)).isoformat(),
            "laboratory": "AUTOMATED TEST lab", "method": "Synthetic test fixture instrument", "treatment_status": "Unknown"}
    headers = {"X-CSRF-Token": csrf}
    assert client.post("/api/v1/water-quality/records", headers=headers, json=body).status_code == 422
    response = client.post("/api/v1/water-quality/records", headers=headers, json={**body, "ph": 7.2, "tds_mg_l": 30})
    assert response.status_code == 201
    quality = client.get(f"/api/v1/water-quality/{prop['id']}").json()["data"]
    assert quality["records"][0]["ph"] == 7.2
    assert quality["records"][0]["turbidity_ntu"] is None
    assert "cannot certify" in " ".join(quality["limitations"])


@pytest.mark.parametrize("values", [{"ph": 15}, {"tds_mg_l": -5}, {"turbidity_ntu": float("nan")}])
def test_quality_invalid_ranges(values):
    with pytest.raises(ValidationError):
        Quality(property_id="test", tested_at=now(), laboratory="test lab", method="test method",
                treatment_status="test status", **values)


def test_maintenance_latest_condition_due_dates_and_unknown(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    headers = {"X-CSRF-Token": csrf}
    body = {"property_id": prop["id"], "task": "filter_cleaning", "performed_at": (now() - timedelta(days=2)).isoformat(),
            "next_due_at": (now() - timedelta(days=1)).isoformat(), "condition": "good", "notes": "AUTOMATED TEST cleaning"}
    assert client.post("/api/v1/maintenance/records", headers=headers, json=body).status_code == 201
    initial = client.get(f"/api/v1/maintenance/{prop['id']}").json()["data"]
    assert initial["alerts"][0]["status"] == "overdue"
    assert initial["readiness"]["forecast"] is None
    assert sum(check["status"] == "unknown" for check in initial["readiness"]["checks"]) == 6
    body.update(performed_at=(now() - timedelta(hours=1)).isoformat(),
                next_due_at=(now() + timedelta(days=1)).isoformat(), condition="good")
    assert client.post("/api/v1/maintenance/records", headers=headers, json=body).status_code == 201
    assert client.get(f"/api/v1/maintenance/{prop['id']}").json()["data"]["alerts"] == []


def test_maintenance_future_work_is_not_an_observation():
    with pytest.raises(ValidationError):
        Maintenance(property_id="test", task="roof_cleaning", condition="good", performed_at=now() + timedelta(days=1))
    with pytest.raises(ValidationError):
        Maintenance(property_id="test", task="roof_cleaning", condition="good", performed_at=now(),
                    next_due_at=datetime(2026, 1, 1))


def test_repeated_underperformance_requires_reliable_pairs(client, db_session):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    stored = db_session.get(Property, prop["id"])
    stored.parameters_updated_at = now() - timedelta(days=10)
    stored.measurement_status = "field_verified"
    for day in range(3):
        end = now() - timedelta(days=3 - day)
        for kind, value in (("rainfall", 10), ("collection", 250), ("first_flush", 0)):
            db_session.add(RainfallObservation(property_id=stored.id, user_id=stored.owner_id,
                                               kind=kind, value=value, unit="mm" if kind == "rainfall" else "L",
                                               measured_at=end, interval_start=end - timedelta(hours=1), interval_end=end,
                                               method="AUTOMATED TEST measured", reliability="measured",
                                               parameter_snapshot=roof_parameters(stored)))
    db_session.commit()
    alerts = client.get(f"/api/v1/maintenance/{stored.id}").json()["data"]["alerts"]
    assert alerts[0]["code"] == "collection_underperformance"
    assert "unconfirmed" in alerts[0]["message"]
    stored.parameters_updated_at = now()
    db_session.commit()
    assert client.get(f"/api/v1/maintenance/{stored.id}").json()["data"]["alerts"] == []


def budget_body(prop, **changes):
    return {"budget_inr": 10000, "start_date": "2025-01-01", "end_date": "2025-01-03",
            "options": [{"property_id": prop["id"], "capacity_l": 2000, "cost_inr": 5000,
                         "quote_source": "AUTOMATED TEST fixture quote", "installation_space_confirmed": True}], **changes}


def test_community_requires_verification_and_quotes(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    response = client.post("/api/v1/community/optimise", headers={"X-CSRF-Token": csrf}, json=budget_body(prop))
    assert response.status_code == 200
    assert response.json()["data"]["selected"] == []
    assert "Field-verified" in response.json()["data"]["excluded"][0]["reason"]
    body = budget_body(prop)
    body["options"].append(body["options"][0])
    with pytest.raises(ValidationError):
        CommunityBudget(**body)


def test_community_uses_property_coordinate_history_and_incremental_supply(client, db_session, monkeypatch):
    import app.operations_api as operations

    calls = []

    async def fixture_history(db, lat, lon, zone, start, end, provider):
        calls.append((lat, lon))
        return {"daily": [{"date": f"2025-01-0{day}", "precipitation_mm": rain} for day, rain in [(1, 50), (2, 0), (3, 0)]],
                "provider": "AUTOMATED TEST archive", "data_kind": "test_fixture", "retrieved_at": now().isoformat(),
                "coverage": {"days": 3}, "spatial_resolution": "Synthetic fixture only", "attribution": "AUTOMATED TEST"}

    monkeypatch.setattr(operations, "historical", fixture_history)
    csrf = signup(client)
    prop = fixture_property(client, csrf, latitude=19.87, longitude=75.34, daily_demand_l=800)
    db_session.get(Property, prop["id"]).measurement_status = "field_verified"
    db_session.commit()
    response = client.post("/api/v1/community/optimise", headers={"X-CSRF-Token": csrf}, json=budget_body(prop))
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert calls == [(19.87, 75.34)]
    assert result["selected"][0]["period_benefit_l"] == pytest.approx(1000)
    assert result["total_cost_inr"] == 5000
    assert result["budget_remaining_inr"] == 5000
    assert result["evidence"][0]["historical"]["data_kind"] == "test_fixture"
