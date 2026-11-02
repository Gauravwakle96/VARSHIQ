"""Synthetic properties exist only in an isolated automated-test database."""

import os
from datetime import UTC, datetime, timedelta

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app, requests_by_key
from app.models import ForecastAccuracy, WeatherForecast


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    app.dependency_overrides[get_db] = lambda: session
    requests_by_key.clear()
    yield session
    app.dependency_overrides.clear()
    session.close()
    engine.dispose()


@pytest.fixture
def client(db_session):
    with TestClient(app, raise_server_exceptions=True) as client:
        yield client


def signup(client, email="fixture@example.com"):
    csrf = client.get("/api/v1/auth/session").json()["data"]["csrf_token"]
    response = client.post(
        "/api/v1/auth/register",
        headers={"X-CSRF-Token": csrf},
        json={"name": "AUTOMATED TEST Owner", "email": email, "password": "synthetic-test-password-2026"},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]["csrf_token"]


def fixture_property(client, csrf, **changes):
    body = {
        "name": "AUTOMATED TEST Rooftop",
        "property_type": "residential",
        "locality": "AUTOMATED TEST Mumbai",
        "latitude": 19.076,
        "longitude": 72.8777,
        "effective_catchment_m2": 100,
        "runoff_coefficient": 0.8,
        "coefficient_source": "Synthetic test assumption",
        "first_flush_mm": 1,
        "collection_efficiency": 0.9,
        "tank_capacity_l": 1000,
        "current_storage_l": 200,
        "daily_demand_l": 100,
        **changes,
    }
    response = client.post("/api/v1/buildings", json=body, headers={"X-CSRF-Token": csrf})
    assert response.status_code == 201, response.text
    return response.json()["data"]


def test_private_endpoints_require_auth(client):
    for path in ("/buildings", "/dashboard/locality", "/data-sources/status", "/reports"):
        response = client.get("/api/v1" + path)
        assert response.status_code == 401
        assert "error" in response.json()


def test_csrf_and_validation_do_not_echo_password(client):
    assert (
        client.post(
            "/api/v1/auth/register", json={"name": "Test", "email": "valid@example.com", "password": "abc"}
        ).status_code
        == 403
    )
    token = client.get("/api/v1/auth/session").json()["data"]["csrf_token"]
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test", "email": "valid@example.com", "password": "private-short"},
        headers={"X-CSRF-Token": token},
    )
    assert response.status_code == 200
    invalid = client.post(
        "/api/v1/auth/login",
        json={"email": "invalid", "password": "secret-must-not-echo"},
        headers={"X-CSRF-Token": response.json()["data"]["csrf_token"]},
    )
    assert invalid.status_code == 422
    assert "secret-must-not-echo" not in invalid.text


def test_registration_empty_workspace_and_no_role_escalation(client):
    signup(client)
    assert client.get("/api/v1/buildings").json()["data"] == []
    assert client.get("/api/v1/auth/session").json()["data"]["user"]["role"] == "owner"
    assert client.get("/api/v1/dashboard/municipal").status_code == 403


def test_property_validation_and_provenance(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    assert prop["measurement_status"] == "user_entered"
    assert prop["footprint_area_m2"] is None
    assert (
        client.patch(
            f"/api/v1/buildings/{prop['id']}", json={"tank_capacity_l": 100}, headers={"X-CSRF-Token": csrf}
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"/api/v1/buildings/{prop['id']}",
            json={"measurement_status": "field_verified"},
            headers={"X-CSRF-Token": csrf},
        ).status_code
        == 422
    )
    assert (
        client.get(f"/api/v1/buildings/{prop['id']}").json()["data"]["measurements"][0]["status"]
        == "user_entered"
    )


def test_cross_organisation_property_and_report_access(client, db_session):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    report = client.post(
        "/api/v1/reports", json={"property_id": prop["id"]}, headers={"X-CSRF-Token": csrf}
    ).json()["data"]
    client.post("/api/v1/auth/logout", json={}, headers={"X-CSRF-Token": csrf})
    csrf2 = signup(client, "second@example.com")
    assert client.get(f"/api/v1/buildings/{prop['id']}").status_code == 404
    assert client.get(f"/api/v1/reports/{report['id']}/download").status_code == 404
    assert (
        client.post(
            "/api/v1/rainwater/forecast", json={"property_id": prop["id"]}, headers={"X-CSRF-Token": csrf2}
        ).status_code
        == 404
    )


def test_verification_requires_evidence_and_timezone(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    route = f"/api/v1/buildings/{prop['id']}/measurements"
    invalid = {
        "area_m2": 90,
        "method": "Tape",
        "evidence_note": "",
        "measured_at": "2026-01-01T12:00:00",
        "status": "field_verified",
    }
    assert client.post(route, json=invalid, headers={"X-CSRF-Token": csrf}).status_code == 422
    valid = {
        **invalid,
        "evidence_note": "AUTOMATED TEST field measurement evidence",
        "measured_at": "2026-01-01T12:00:00+05:30",
    }
    assert (
        client.post(route, json=valid, headers={"X-CSRF-Token": csrf}).json()["data"]["measurement_status"]
        == "field_verified"
    )


def test_observation_units_future_and_physical_limits(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    base = {
        "property_id": prop["id"],
        "kind": "storage",
        "value": 1001,
        "unit": "L",
        "method": "Test sensor",
        "reliability": "measured",
        "measured_at": datetime.now(UTC).isoformat(),
    }
    assert (
        client.post("/api/v1/storage/observations", json=base, headers={"X-CSRF-Token": csrf}).status_code
        == 422
    )
    future = {**base, "value": 100, "measured_at": (datetime.now(UTC) + timedelta(days=2)).isoformat()}
    assert (
        client.post("/api/v1/storage/observations", json=future, headers={"X-CSRF-Token": csrf}).status_code
        == 422
    )
    rainfall = {**base, "kind": "rainfall", "value": 2, "unit": "mm"}
    assert (
        client.post("/api/v1/storage/observations", json=rainfall, headers={"X-CSRF-Token": csrf}).status_code
        == 422
    )
    valid = {**base, "value": 100}
    assert (
        client.post("/api/v1/storage/observations", json=valid, headers={"X-CSRF-Token": csrf}).status_code
        == 201
    )
    assert client.get(f"/api/v1/buildings/{prop['id']}").json()["data"]["current_storage_l"] == 100


def test_report_outputs_escape_property_and_explain_missing_data(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf, name="<script>TEST</script>")
    report = client.post(
        "/api/v1/reports", json={"property_id": prop["id"]}, headers={"X-CSRF-Token": csrf}
    ).json()["data"]
    html = client.get(f"/api/v1/reports/{report['id']}/download?format=html")
    assert "<script>TEST</script>" not in html.text
    assert "&lt;script&gt;TEST&lt;/script&gt;" in html.text
    pdf = client.get(f"/api/v1/reports/{report['id']}/download?format=pdf")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")


def test_community_never_fabricates_properties(client):
    csrf = signup(client)
    initial = client.get("/api/v1/dashboard/locality").json()["data"]
    assert initial["registered_count"] == 0
    assert initial["forecast_potential_l"] is None
    fixture_property(client, csrf)
    fixture_property(client, csrf, name="AUTOMATED TEST Commercial", property_type="commercial")
    summary = client.get("/api/v1/dashboard/locality").json()["data"]
    assert summary["registered_count"] == 2
    assert summary["residential_count"] == summary["commercial_count"] == 1
    assert summary["verified_rooftop_m2"] == 0


def test_calibration_not_eligible_without_measured_pairs(client):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    data = client.get(f"/api/v1/calibration/{prop['id']}").json()["data"]
    assert data["eligibility"]["eligible"] is False
    assert data["accuracy"] == []
    assert (
        client.post(
            f"/api/v1/calibration/{prop['id']}/apply", json={}, headers={"X-CSRF-Token": csrf}
        ).status_code
        == 422
    )


def test_forecast_accuracy_uses_prior_snapshot(client, db_session):
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) - timedelta(days=2)
    payload = {"hourly": [{"time": start.isoformat(), "precipitation_mm": 3, "liquid_rainfall_mm": 3}]}
    prior = WeatherForecast(
        property_id=prop["id"],
        cache_key="TEST",
        provider="TEST FIXTURE",
        retrieved_at=start - timedelta(hours=12),
        payload=payload,
    )
    later = WeatherForecast(
        property_id=prop["id"],
        cache_key="TEST",
        provider="TEST FIXTURE",
        retrieved_at=start + timedelta(hours=1),
        payload={"hourly": [{"time": start.isoformat(), "precipitation_mm": 100}]},
    )
    db_session.add_all([prior, later])
    db_session.commit()
    observation = {
        "property_id": prop["id"],
        "kind": "rainfall",
        "value": 4,
        "unit": "mm",
        "method": "Test gauge",
        "reliability": "measured",
        "interval_start": start.isoformat(),
        "interval_end": (start + timedelta(hours=1)).isoformat(),
        "measured_at": (start + timedelta(hours=1)).isoformat(),
    }
    assert (
        client.post(
            "/api/v1/storage/observations", json=observation, headers={"X-CSRF-Token": csrf}
        ).status_code
        == 201
    )
    accuracy = db_session.scalar(select(ForecastAccuracy))
    assert accuracy.forecast_id == prior.id
    assert accuracy.predicted_mm == 3


def test_admin_edit_and_origin_protection(client):
    csrf = signup(client)
    assert (
        client.patch(
            "/api/v1/admin/settings",
            json={
                "pilot_locality": "Mumbai",
                "pilot_latitude": 19,
                "pilot_longitude": 72,
                "pilot_timezone": "Asia/Kolkata",
            },
            headers={"X-CSRF-Token": csrf},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/rainwater/calculate",
            json={},
            headers={"X-CSRF-Token": csrf, "Origin": "https://evil.example"},
        ).status_code
        == 403
    )
