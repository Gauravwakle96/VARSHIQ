"""Confirmed map estimates use synthetic test geometry, never production measurements."""
import pytest
from sqlalchemy import select
from test_api import fixture_property, signup

from app.models import AuditLog, RainfallObservation, RoofMeasurement
from app.services.evidence import input_fingerprint

OUTLINE = {"type": "Polygon", "coordinates": [[[72.8777, 19.076], [72.8778, 19.076],
    [72.8778, 19.0761], [72.8777, 19.0761], [72.8777, 19.076]]]}


def map_property(client, csrf):
    return fixture_property(client, csrf, geometry=OUTLINE, geometry_source="osm",
        effective_catchment_m2=None, roof_map_estimate={"confirmed": True, "connected_fraction": .5})


def test_registration_derives_area_and_records_confirmation_without_field_verification(client, db_session):
    csrf = signup(client)
    prop = map_property(client, csrf)
    provenance = prop["roof_area_provenance"]
    assert 100 < provenance["outline_area_m2"] < 125  # ~11 m square at this test latitude.
    assert prop["effective_catchment_m2"] == pytest.approx(provenance["outline_area_m2"] / 2)
    assert prop["measurement_status"] == "map_estimated"
    assert provenance["field_verified"] is False and provenance["confirmed_at"]
    assert provenance["source"] == "osm" and provenance["confirmed_by"] == prop["owner_id"]
    roof = list(db_session.scalars(select(RoofMeasurement)))
    assert len(roof) == 1 and roof[0].status == "map_estimated"
    assert list(db_session.scalars(select(RainfallObservation))) == []
    assert db_session.scalar(select(AuditLog).where(AuditLog.action == "roof.map_estimate_confirm"))
    summary = client.get("/api/v1/dashboard/locality").json()["data"]
    assert summary["verified_rooftop_m2"] == 0


@pytest.mark.parametrize("confirmation", [{"confirmed": False}, {}, {"confirmed": True, "connected_fraction": 0},
    {"confirmed": True, "connected_fraction": 1.1}, {"confirmed": True, "area_m2": 999999}])
def test_unconfirmed_or_untrusted_map_requests_do_not_update_property(client, confirmation):
    csrf = signup(client)
    prop = fixture_property(client, csrf, geometry=OUTLINE)
    response = client.patch(f"/api/v1/buildings/{prop['id']}", headers={"X-CSRF-Token": csrf},
        json={"roof_map_estimate": confirmation})
    assert response.status_code == 422
    unchanged = client.get(f"/api/v1/buildings/{prop['id']}").json()["data"]
    assert unchanged["effective_catchment_m2"] == 100 and unchanged["roof_area_provenance"] == {}


def test_missing_outline_and_conflicting_manual_area_are_rejected(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    path = f"/api/v1/buildings/{prop['id']}"
    headers = {"X-CSRF-Token": csrf}
    assert client.patch(path, headers=headers, json={"roof_map_estimate": {"confirmed": True}}).status_code == 422
    assert client.patch(path, headers=headers, json={"geometry": OUTLINE, "roof_map_estimate": {"confirmed": True},
        "effective_catchment_m2": 1}).status_code == 422


def test_map_confirmation_preserves_other_planning_assumptions_and_updates_fingerprint(client, db_session):
    from app.models import Property
    csrf = signup(client)
    prop = fixture_property(client, csrf, geometry=OUTLINE)
    path = f"/api/v1/buildings/{prop['id']}"
    headers = {"X-CSRF-Token": csrf}
    client.patch(path, headers=headers, json={"planning_assumptions": True})
    before = input_fingerprint(db_session.get(Property, prop["id"]))
    response = client.patch(path, headers=headers, json={"roof_map_estimate": {"confirmed": True}})
    assert response.status_code == 200
    result = response.json()["data"]
    assert result["measurement_status"] == "planning_assumptions"
    assert result["roof_area_provenance"]["basis"] == "user_confirmed_map_estimate"
    assert (result["tank_capacity_l"], result["daily_demand_l"], result["current_storage_l"]) == (1000, 100, 200)
    assert result["storage_status"] == "estimated"
    assert input_fingerprint(db_session.get(Property, prop["id"])) != before


def test_unrelated_changes_preserve_provenance_and_manual_correction_clears_it(client):
    csrf = signup(client)
    prop = map_property(client, csrf)
    path = f"/api/v1/buildings/{prop['id']}"
    headers = {"X-CSRF-Token": csrf}
    result = client.patch(path, headers=headers, json={"daily_demand_l": 120}).json()["data"]
    assert result["roof_area_provenance"] == prop["roof_area_provenance"]
    assert result["measurement_status"] == "map_estimated"
    result = client.patch(path, headers=headers, json={"effective_catchment_m2": 90}).json()["data"]
    assert result["roof_area_provenance"] == {} and result["measurement_status"] == "user_entered"
    evidence = client.get(path).json()["data"]["measurements"]
    assert {item["status"] for item in evidence} == {"user_entered", "map_estimated"}


def test_other_owner_cannot_confirm_private_roof(client):
    csrf = signup(client)
    prop = map_property(client, csrf)
    csrf = signup(client, "other-map-owner@example.com")
    response = client.patch(f"/api/v1/buildings/{prop['id']}", headers={"X-CSRF-Token": csrf},
        json={"roof_map_estimate": {"confirmed": True}})
    assert response.status_code == 404


@pytest.mark.parametrize("question", ["How much could this roof collect tomorrow?", "Suggest harvesting improvements"])
def test_roof_guidance_uses_saved_map_provenance_and_calculations(client, monkeypatch, question):
    from test_planning_assumptions import synthetic_forecast
    csrf = signup(client)
    prop = map_property(client, csrf)
    monkeypatch.setattr("app.services.watertwin.forecast", synthetic_forecast)
    response = client.post("/api/v1/assistant/chat", headers={"X-CSRF-Token": csrf},
        json={"property_id": prop["id"], "message": question})
    assert response.status_code == 200
    reply = response.json()["data"]
    assert reply["mode"] == "deterministic"
    assert "user-confirmed map estimate" in reply["answer"]
    assert any(source["type"] == "map_area_estimate" for source in reply["sources"])
    if "improvements" in question:
        assert "drains and filters" in reply["answer"]
        assert any(source["type"] == "backend_recommendation" for source in reply["sources"])


def test_improvement_guidance_keeps_remaining_planning_inputs_visible(client, monkeypatch):
    from test_planning_assumptions import synthetic_forecast
    csrf = signup(client)
    prop = map_property(client, csrf)
    client.patch(f"/api/v1/buildings/{prop['id']}", headers={"X-CSRF-Token": csrf},
        json={"planning_assumptions": True})
    monkeypatch.setattr("app.services.watertwin.forecast", synthetic_forecast)
    response = client.post("/api/v1/assistant/chat", headers={"X-CSRF-Token": csrf},
        json={"property_id": prop["id"], "message": "Suggest harvesting improvements"})
    assert response.status_code == 200
    assert "illustrative planning assumptions" in response.json()["data"]["answer"]
