"""Authorised fictional preview data only; all database evidence stays isolated."""

import time

import httpx
import pytest
from sqlalchemy import func, select

from app.database import Base
from app.main import requests_by_key


def counts(db):
    return {
        name: db.scalar(select(func.count()).select_from(table))
        for name, table in Base.metadata.tables.items()
    }


def test_feature_workspace_and_pdf_are_stateless_and_never_contact_providers(client, db_session, monkeypatch):
    async def forbidden_request(*args, **kwargs):
        raise AssertionError("Feature samples must not contact external providers")

    monkeypatch.setattr(httpx.AsyncClient, "request", forbidden_request)
    before = counts(db_session)
    response = client.post("/api/v1/demo/workspace", json={"capacity_l": 2000, "annual_rainfall_mm": 1500})
    assert response.status_code == 200 and "set-cookie" not in response.headers
    result = response.json()["data"]
    data = result["workspace"]
    assert result["persisted"] is data["persisted"] is False
    assert result["data_kind"] == data["data_kind"] == "simulated_demonstration"
    assert sum(row["rainfall_mm"] for row in data["historical"]["monthly"]) == pytest.approx(1500)
    assert sum(row["volume_l"] for row in data["supply"]) == pytest.approx(result["calculation"]["demand_l"])
    assert sum(row["volume_l"] for row in data["consumption"]) == pytest.approx(
        result["calculation"]["demand_l"]
    )
    for candidate in data["annual_sizing"]["comparisons"]:
        simulation = candidate["simulation"]
        assert simulation["balance_error_l"] == pytest.approx(0, abs=1e-7)
        assert candidate["cost_inr"] is None
    assert all(row["registered"] is False for row in data["properties"])
    assert data["community"]["verified_area_m2"] == 0
    assert data["performance"]["calibration_eligible"] is False
    assert data["groundwater"]["depth_m"] is data["groundwater"]["infiltration_mm_h"] is None
    assert counts(db_session) == before
    pdf = client.post("/api/v1/demo/report", json={"capacity_l": 2000})
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-")
    assert b"SIMULATED" in pdf.content
    assert pdf.headers["x-varshiq-data-kind"] == "simulated_demonstration"
    assert "SIMULATED" in pdf.headers["content-disposition"] and "set-cookie" not in pdf.headers
    assert counts(db_session) == before
    assert client.get("/api/v1/buildings").status_code == 401
    assert client.get("/api/v1/dashboard/municipal").status_code == 401


def test_dry_feature_example_does_not_invent_samples_or_annual_benefit(client):
    response = client.post(
        "/api/v1/demo/workspace",
        json={
            "weather": "dry",
            "rainfall_mm": 0,
            "annual_rainfall_mm": 0,
            "budget_inr": 0,
        },
    )
    assert response.status_code == 200
    result = response.json()["data"]
    assert result["workspace"]["performance"]["pairs"] == []
    assert result["workspace"]["performance"]["mae_l"] is None
    assert result["workspace"]["annual_sizing"]["recommended_range_l"] == []
    assert result["community"]["selected"] == []
    assert result["workspace"]["community"]["net_inflow_l"] == 0


@pytest.mark.parametrize("path", ["workspace", "report"])
@pytest.mark.parametrize(
    "body",
    [
        {"annual_rainfall_mm": -1},
        {"annual_rainfall_mm": 5001},
        {"annual_rainfall_mm": None},
        {"property_id": "private-record"},
        {"measurements": [{"value": 500}]},
        {"role": "municipal"},
        {"capacity_l": 1000000},
    ],
)
def test_preview_rejects_unbounded_and_private_evidence_inputs(client, path, body):
    response = client.post(f"/api/v1/demo/{path}", json=body)
    assert response.status_code == 422 and "private-record" not in response.text


@pytest.mark.parametrize("path", ["workspace", "report"])
def test_preview_and_export_share_the_bounded_public_demo_rate_bucket(client, path):
    requests_by_key[("testclient", "demo")].extend([time.monotonic()] * 60)
    assert client.post(f"/api/v1/demo/{path}", json={}).status_code == 429
    assert client.get("/api/v1/health").status_code == 200
