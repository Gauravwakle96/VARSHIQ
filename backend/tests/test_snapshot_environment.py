"""Synthetic prediction and approved-file test fixtures only."""
import json
from datetime import timedelta

import httpx
import pytest
from pydantic import ValidationError
from test_api import fixture_property, signup
from test_providers import install_transport, raw_forecast

from app.models import now
from app.services.environment import approved_records
from app.services.locations import get_settings


@pytest.mark.parametrize("value", [1, 6, 168, "6"])
def test_event_gap_configuration_matches_hydrology_contract(value):
    from app.config import Settings

    configured = Settings(_env_file=None, app_env="test", rain_event_dry_gap_hours=value)
    assert type(configured.rain_event_dry_gap_hours) is int
    assert 1 <= configured.rain_event_dry_gap_hours <= 168


@pytest.mark.parametrize("value", [0, 169, 1.5])
def test_event_gap_configuration_rejects_invalid_intervals(value):
    from app.config import Settings

    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_env="test", rain_event_dry_gap_hours=value)


def test_saved_twin_superseded_by_changed_inputs_and_old_forecast(client, monkeypatch):
    install_transport(monkeypatch, lambda request: httpx.Response(200, json=raw_forecast()))
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    headers = {"X-CSRF-Token": csrf}
    response = client.post("/api/v1/watertwin/simulate", headers=headers, json={"property_id": prop["id"]})
    assert response.status_code == 200 and response.json()["data"]["stale"] is False
    client.patch(f"/api/v1/buildings/{prop['id']}", headers=headers, json={"daily_demand_l": 300})
    history = client.get(f"/api/v1/rainwater/history/{prop['id']}").json()["data"]
    assert history[0]["stale"] and history[0]["inputs_changed"]
    assert history[0]["assumptions"]["daily_demand_l"] == 100
    assert client.get(f"/api/v1/watertwin/{prop['id']}").json()["data"]["latest_simulation"]["stale"]


def test_approved_environment_data_keeps_coverage_and_provenance(monkeypatch, tmp_path):
    path = tmp_path / "AUTOMATED-TEST-groundwater.json"
    provenance = {"source": "AUTOMATED TEST source", "source_url": "https://example.com/test-only",
                  "dataset_date": "2025-01-01", "resolution": "Synthetic region only", "coverage": "Test polygon",
                  "verification_status": "unverified_regional", "licence": "Synthetic test fixture"}
    feature = {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[[75, 19], [76, 19], [76, 20], [75, 20], [75, 19]]]},
               "properties": {"provenance": provenance, "data": {"notes": "AUTOMATED TEST; no real groundwater value"}}}
    path.write_text(json.dumps({"type": "FeatureCollection", "features": [feature]}))
    monkeypatch.setattr(get_settings(), "groundwater_approved_file", str(path))
    records, status = approved_records(19.87, 75.34, "groundwater")
    assert status == "records_available" and records[0]["provenance"] == provenance
    assert approved_records(30, 70, "groundwater") == ([], "outside_approved_coverage")
    feature["properties"]["provenance"].pop("licence")
    path.write_text(json.dumps({"type": "FeatureCollection", "features": [feature]}))
    assert approved_records(19.87, 75.34, "groundwater") == ([], "invalid_source_or_provenance")


def test_old_forecast_is_explicitly_stale(client, monkeypatch, db_session):
    from sqlalchemy import select

    from app.models import RainwaterCalculation

    install_transport(monkeypatch, lambda request: httpx.Response(200, json=raw_forecast()))
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    client.post("/api/v1/rainwater/forecast", headers={"X-CSRF-Token": csrf}, json={"property_id": prop["id"]})
    record = db_session.scalar(select(RainwaterCalculation))
    payload = dict(record.payload)
    payload["forecast"] = {**payload["forecast"], "retrieved_at": (now() - timedelta(hours=2)).isoformat()}
    record.payload = payload
    db_session.commit()
    latest = client.get(f"/api/v1/rainwater/history/{prop['id']}").json()["data"][0]
    assert latest["stale"] and not latest["inputs_changed"]
    assert "freshness" in latest["stale_reasons"][0]
