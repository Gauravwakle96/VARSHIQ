"""Synthetic planning inputs in an isolated test database; never field evidence."""

from datetime import timedelta

import pytest
from sqlalchemy import func, select
from test_api import fixture_property, signup

from app.database import Base
from app.models import WaterDemand, WaterTank, now

PLAN = {
    "planning_assumptions": True,
    "effective_catchment_m2": 120,
    "runoff_coefficient": 0.8,
    "coefficient_source": "AUTOMATED TEST illustrative planning assumption; not a measured coefficient",
    "first_flush_mm": 1,
    "collection_efficiency": 0.9,
    "tank_capacity_l": 2000,
    "current_storage_l": 500,
    "daily_demand_l": 400,
    "storage_status": "estimated",
}


def evidence_counts(db):
    return {
        name: db.scalar(select(func.count()).select_from(table))
        for name, table in Base.metadata.tables.items()
        if name not in {"audit_logs", "water_demand"}
    }


async def synthetic_forecast(*args, **kwargs):
    start = (now() + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    return {
        "id": "AUTOMATED TEST forecast",
        "provider": "AUTOMATED TEST weather",
        "retrieved_at": now().isoformat(),
        "spatial_resolution": "Synthetic test grid",
        "limitations": ["Synthetic response restricted to automated testing"],
        "stale": False,
        "hourly": [{"time": start.isoformat(), "precipitation_mm": 5}],
        "daily": [{"date": start.date().isoformat(), "precipitation_mm": 5}],
        "tomorrow": {
            "date": (start + timedelta(days=1)).date().isoformat(),
            "precipitation_mm": 0,
            "probability_pct": 0,
        },
    }


def test_planning_configuration_and_forecast_create_no_measurements(client, db_session, monkeypatch):
    csrf = signup(client)
    prop = fixture_property(client, csrf, effective_catchment_m2=None)
    before = evidence_counts(db_session)
    response = client.patch(f"/api/v1/buildings/{prop['id']}", json=PLAN, headers={"X-CSRF-Token": csrf})
    assert response.status_code == 200
    assert response.json()["data"]["measurement_status"] == "planning_assumptions"
    assert evidence_counts(db_session) == before
    tank = db_session.scalar(select(WaterTank).where(WaterTank.property_id == prop["id"]))
    demand = db_session.scalar(
        select(WaterDemand)
        .where(WaterDemand.property_id == prop["id"])
        .order_by(WaterDemand.created_at.desc())
    )
    assert tank.provenance["source"] == demand.provenance["source"] == "planning_assumption"

    monkeypatch.setattr("app.services.watertwin.forecast", synthetic_forecast)
    simulation = client.post(
        "/api/v1/rainwater/scenario",
        headers={"X-CSRF-Token": csrf},
        json={"property_id": prop["id"], "days": 1, "capacity_l": 2000, "daily_demand_l": 400},
    )
    assert simulation.status_code == 200
    result = simulation.json()["data"]
    assert result["assumptions"]["input_basis"] == "planning_assumptions"
    assert result["confidence"]["calculation_kind"] == "forecast_with_planning_assumptions"
    assert "Measured tank capacity and starting storage" in result["confidence"]["missing_information"]
    assert result["scenario"] is True and result["id"] == "scenario"
    assert evidence_counts(db_session) == before
    detail = client.get(f"/api/v1/buildings/{prop['id']}").json()["data"]
    assert detail["measurements"] == [] and detail["current_storage_l"] == 500


def test_ordinary_updates_preserve_assumption_basis(client, db_session):
    csrf = signup(client)
    prop = fixture_property(client, csrf, effective_catchment_m2=None)
    client.patch(f"/api/v1/buildings/{prop['id']}", json=PLAN, headers={"X-CSRF-Token": csrf})
    before = evidence_counts(db_session)
    response = client.patch(
        f"/api/v1/buildings/{prop['id']}",
        json={"effective_catchment_m2": 150, "notes": "AUTOMATED TEST planning change"},
        headers={"X-CSRF-Token": csrf},
    )
    assert (
        response.status_code == 200
        and response.json()["data"]["measurement_status"] == "planning_assumptions"
    )
    assert evidence_counts(db_session) == before


@pytest.mark.parametrize("change", [{"storage_status": "measured"}, {"current_storage_l": 3000}])
def test_assumptions_cannot_bypass_evidence_or_physical_validation(client, db_session, change):
    csrf = signup(client)
    prop = fixture_property(client, csrf, effective_catchment_m2=None)
    before = evidence_counts(db_session)
    response = client.patch(
        f"/api/v1/buildings/{prop['id']}", json={**PLAN, **change}, headers={"X-CSRF-Token": csrf}
    )
    assert response.status_code == 422 and evidence_counts(db_session) == before
    assert client.get(f"/api/v1/buildings/{prop['id']}").json()["data"]["effective_catchment_m2"] is None


def test_planning_updates_remain_owner_scoped(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf, effective_catchment_m2=None)
    other_csrf = signup(client, "other-planning-test@example.com")
    response = client.patch(
        f"/api/v1/buildings/{prop['id']}", json=PLAN, headers={"X-CSRF-Token": other_csrf}
    )
    assert response.status_code == 404


def test_planning_advice_and_sizing_do_not_claim_measured_inputs(client, db_session, monkeypatch):
    csrf = signup(client)
    prop = fixture_property(client, csrf, effective_catchment_m2=None)
    client.patch(f"/api/v1/buildings/{prop['id']}", json=PLAN, headers={"X-CSRF-Token": csrf})
    before = evidence_counts(db_session)

    async def synthetic_history(*args, **kwargs):
        return {
            "provider": "AUTOMATED TEST history",
            "daily": [{"date": "2025-01-01", "precipitation_mm": 5}],
        }

    monkeypatch.setattr("app.api.historical", synthetic_history)
    response = client.post(
        "/api/v1/storage/optimise",
        headers={"X-CSRF-Token": csrf},
        json={
            "property_id": prop["id"],
            "capacities_l": [1000, 2000],
            "start_date": "2025-01-01",
            "end_date": "2025-01-01",
        },
    )
    assert response.status_code == 200
    sizing = response.json()["data"]
    assert sizing["input_basis"] == "planning_assumptions"
    assert any("verify them" in item for item in sizing["limitations"])
    assert evidence_counts(db_session) == before
    response = client.post(
        "/api/v1/recommendations/generate",
        json={"property_id": prop["id"]},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 200
    advice = response.json()["data"]
    assert advice["input_basis"] == "planning_assumptions"
    assert advice["items"][0]["status"] == "preliminary"
    assert "Measured tank capacity" in advice["items"][0]["missing_information"]
    assert client.get(f"/api/v1/buildings/{prop['id']}").json()["data"]["measurements"] == []
    aggregate = client.get("/api/v1/dashboard/locality").json()["data"]
    assert aggregate["verified_rooftop_m2"] == 0 and aggregate["unverified_count"] == 1


@pytest.mark.parametrize("question", ["Will my tank overflow?", "How much can I collect tomorrow?"])
def test_assistant_discloses_planning_basis_for_both_answers(client, db_session, monkeypatch, question):
    csrf = signup(client)
    prop = fixture_property(client, csrf, effective_catchment_m2=None)
    client.patch(f"/api/v1/buildings/{prop['id']}", json=PLAN, headers={"X-CSRF-Token": csrf})
    monkeypatch.setattr("app.services.watertwin.forecast", synthetic_forecast)
    response = client.post(
        "/api/v1/assistant/chat",
        json={"property_id": prop["id"], "message": question},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 200
    assert "illustrative planning assumptions" in response.json()["data"]["answer"]
    assert "verify the physical inputs" in response.json()["data"]["answer"]
    storage = client.get(f"/api/v1/storage/{prop['id']}").json()["data"]
    assert storage["observations"] == [] and storage["property"]["current_storage_l"] == 500
