"""Authorised simulation mode and synthetic provider fixtures; no production data."""

import time

import httpx
import pytest
from sqlalchemy import func, select
from test_providers import install_transport

from app.database import Base
from app.demo_api import DemoInputs
from app.main import requests_by_key
from app.services.buildings import building_footprint_service as buildings
from app.services.demo import synthetic_rainfall
from app.services.hydrology import simulate


def test_anonymous_demo_uses_core_model_without_records_or_outbound_calls(client, db_session, monkeypatch):
    before = {
        name: db_session.scalar(select(func.count()).select_from(table))
        for name, table in Base.metadata.tables.items()
    }

    def no_outbound(*args, **kwargs):
        raise AssertionError("A simulated water balance must not call a live provider")

    monkeypatch.setattr(httpx, "AsyncClient", no_outbound)
    response = client.post("/api/v1/demo/simulate", json={})
    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    data = response.json()["data"]
    assert data["data_kind"] == "simulated_demonstration" and data["persisted"] is False
    expected = simulate(
        synthetic_rainfall(36, "bursts"),
        area_m2=120,
        runoff_coefficient=0.8,
        first_flush_mm=1,
        collection_efficiency=0.9,
        capacity_l=1200,
        initial_storage_l=300,
        daily_demand_l=400,
        reporting_timezone="Asia/Kolkata",
    )
    assert data["calculation"] == expected
    assert len(expected["events"]) == 2 and expected["first_flush_l"] == pytest.approx(192)
    after = {
        name: db_session.scalar(select(func.count()).select_from(table))
        for name, table in Base.metadata.tables.items()
    }
    assert before == after
    assert client.get("/api/v1/buildings").status_code == 401


@pytest.mark.parametrize(
    "changes",
    [
        {"rainfall_mm": -1},
        {"rainfall_mm": 121},
        {"area_m2": 0},
        {"capacity_l": 0},
        {"initial_storage_pct": 101},
        {"daily_demand_l": 30001},
        {"budget_inr": 200001},
        {"runoff_coefficient": 1.1},
        {"collection_efficiency": -0.1},
        {"weather": "dry", "rainfall_mm": 1},
        {"profile": "private-property-id"},
        {"property_id": "forbidden"},
        {"hourly": []},
        {"latitude": 19.87},
    ],
)
def test_demo_rejects_invalid_bounds_and_private_record_inputs(client, changes):
    assert client.post("/api/v1/demo/simulate", json=changes).status_code == 422


def test_demo_dry_period_and_empty_budget_do_not_invent_benefits(client):
    data = client.post(
        "/api/v1/demo/simulate", json={"weather": "dry", "rainfall_mm": 0, "budget_inr": 0}
    ).json()["data"]
    assert data["calculation"]["net_inflow_l"] == 0
    assert data["calculation"]["first_flush_l"] == 0 and data["calculation"]["events"] == []
    assert data["calculation"]["water_supplied_l"] == 300
    assert data["calculation"]["unmet_demand_l"] == pytest.approx(500)
    assert data["community"]["selected"] == [] and data["community"]["period_benefit_l"] == 0


def test_storage_comparison_has_identical_empty_starts_and_community_budget_constraints(client):
    data = client.post("/api/v1/demo/simulate", json={"weather": "steady", "rainfall_mm": 90}).json()["data"]
    assert len(data["calculation"]["events"]) == 1
    assert data["calculation"]["first_flush_l"] == pytest.approx(96)
    for option in data["storage_comparisons"]:
        assert option["water_supplied_l"] + option["final_storage_l"] + option["overflow_l"] == pytest.approx(
            data["calculation"]["net_inflow_l"]
        )
    chosen = data["community"]["selected"]
    assert len({row["property_id"] for row in chosen}) == len(chosen)
    assert sum(row["cost_inr"] for row in chosen) <= data["inputs"]["budget_inr"]
    assert all(row["property_id"].startswith("demo-") for row in chosen)


def test_public_demo_has_its_own_rate_limit(client):
    requests_by_key[("testclient", "demo")].extend([time.monotonic()] * 60)
    assert client.post("/api/v1/demo/simulate", json={}).status_code == 429
    assert client.get("/api/v1/health").status_code == 200


def test_real_demo_footprints_keep_geography_separate_and_do_not_persist(client, db_session, monkeypatch):
    buildings._cache.clear()
    coords = [
        {"lon": 75.34, "lat": 19.87},
        {"lon": 75.3401, "lat": 19.87},
        {"lon": 75.3401, "lat": 19.8701},
        {"lon": 75.34, "lat": 19.87},
    ]
    install_transport(
        monkeypatch,
        lambda request: httpx.Response(
            200,
            json={
                "elements": [
                    {
                        "id": 999,
                        "tags": {"building": "yes", "name": "AUTOMATED TEST outline"},
                        "geometry": coords,
                    }
                ]
            },
        ),
    )
    response = client.get("/api/v1/demo/footprints?latitude=19.87&longitude=75.34")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["data_kind"] == "real_public_geography" and data["water_inputs"] == "simulated_unverified"
    assert data["features"][0]["properties"]["footprint_area_m2"] > 0
    assert data["features"][0]["properties"]["measurement_status"] == "geospatial_estimate"
    assert all(
        db_session.scalar(select(func.count()).select_from(table)) == 0
        for table in Base.metadata.tables.values()
    )
    buildings._cache.clear()
    assert client.get("/api/v1/demo/footprints?latitude=nan&longitude=75.34").status_code == 422


def test_provider_failure_returns_error_without_fake_demo_buildings(client, monkeypatch):
    buildings._cache.clear()

    async def unavailable(*args, **kwargs):
        raise httpx.ConnectError("AUTOMATED TEST provider failure")

    monkeypatch.setattr(httpx.AsyncClient, "post", unavailable)
    monkeypatch.setattr(buildings, "osm_core_extract", unavailable)
    assert client.get("/api/v1/demo/footprints?latitude=19.87&longitude=75.34").status_code == 502


def test_demo_nonfinite_parameters_rejected():
    with pytest.raises(ValueError):
        DemoInputs(rainfall_mm=float("nan"))


def test_public_footprint_limit_is_separate_from_simulations(client):
    requests_by_key[("testclient", "demo_map")].extend([time.monotonic()] * 6)
    response = client.get("/api/v1/demo/footprints?latitude=19.87&longitude=75.34")
    assert response.status_code == 429
    assert client.post("/api/v1/demo/simulate", json={}).status_code == 200


def test_empty_public_geography_stays_empty_without_records(client, db_session, monkeypatch):
    buildings._cache.clear()
    install_transport(monkeypatch, lambda request: httpx.Response(200, json={"elements": []}))
    data = client.get("/api/v1/demo/footprints?latitude=19.87&longitude=75.34").json()["data"]
    assert data["features"] == [] and data["persisted"] is False
    assert all(
        db_session.scalar(select(func.count()).select_from(table)) == 0
        for table in Base.metadata.tables.values()
    )
    buildings._cache.clear()
