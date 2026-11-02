"""Synthetic geocoding/archives, never production location or rain records."""
import asyncio
from datetime import date

import httpx
import pytest
from fastapi import HTTPException
from test_api import signup
from test_providers import install_transport

from app.services import locations
from app.services.rainfall import historical_service as archive
from app.services.rainfall import imd_service as imd


def photon_fixture(**changes):
    return {"features": [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [75.34, 19.87]},
                          "properties": {"osm_type": "R", "osm_id": 123, "countrycode": "IN", "country": "India",
                                         "state": "Maharashtra", "county": "Aurangabad District", "city": "Aurangabad",
                                         "name": "Aurangabad", "postcode": "431001", **changes}}]}


def test_official_district_directory_import_is_bounded_and_attributed(client):
    signup(client)
    result = client.get("/api/v1/locations/districts").json()["data"]
    assert len(result["districts"]) == 36
    assert {"Ahilyanagar", "Dharashiv", "Chhatrapati Sambhajinagar"} <= {row["name"] for row in result["districts"]}
    assert "Copyright Policy" in result["licence"]
    assert "maharashtra.gov.in" in result["source"]
    assert client.get("/api/v1/locations/districts?state=Tamil%20Nadu").json()["data"]["districts"] == []


def test_location_search_current_aliases_coordinate_cache_and_state_filter(client, monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        assert "Maharashtra" in request.url.params["q"]
        assert request.url.params["countrycode"] == "IN"
        return httpx.Response(200, json=photon_fixture())

    install_transport(monkeypatch, handler)
    monkeypatch.setattr(locations, "_last_request", -100)
    signup(client)
    url = "/api/v1/locations/search?q=Aurangabad"
    result = client.get(url).json()["data"]
    assert result["results"][0]["district"] == "Chhatrapati Sambhajinagar"
    assert result["results"][0]["city"] == "Chhatrapati Sambhajinagar"
    assert client.get(url).json()["data"]["cache"] is True
    assert len(calls) == 1
    assert client.get("/api/v1/locations/search?q=%20%20").status_code == 422


def test_reverse_keeps_requested_gps_position(client, monkeypatch):
    install_transport(monkeypatch, lambda request: httpx.Response(200, json=photon_fixture()))
    monkeypatch.setattr(locations, "_last_request", -100)
    signup(client)
    result = client.get("/api/v1/locations/reverse?latitude=19.8762&longitude=75.3433").json()["data"]
    assert result["latitude"] == 19.8762 and result["longitude"] == 75.3433
    assert result["source"] == "osm"
    assert "without snapping" in result["limitations"][-1]


@pytest.mark.parametrize("raw", [{"features": []}, {"features": [{"properties": {}}]}, {"error": "failure"}])
def test_empty_or_malformed_geocoder_is_explicit(client, monkeypatch, raw):
    install_transport(monkeypatch, lambda request: httpx.Response(200, json=raw))
    monkeypatch.setattr(locations, "_last_request", -100)
    signup(client)
    response = client.get("/api/v1/locations/reverse?latitude=19.87&longitude=75.34")
    assert response.status_code == (404 if raw.get("features") == [] else 502)


def test_nominatim_public_requires_deliberate_config_and_structured_fields_not_mixed(client, monkeypatch):
    settings = locations.get_settings()
    monkeypatch.setattr(settings, "geocoding_provider", "nominatim")
    signup(client)
    assert client.get("/api/v1/locations/search?q=Pune").status_code == 503
    monkeypatch.setattr(settings, "geocoding_base_url", "https://geocoder.example.com")

    def handler(request):
        assert "q" in request.url.params and "state" not in request.url.params and "postalcode" not in request.url.params
        return httpx.Response(200, json=[{"lat": "18.52", "lon": "73.85", "osm_type": "node", "osm_id": 12,
                                          "display_name": "AUTOMATED TEST Pune", "address": {"country_code": "in", "state": "Maharashtra", "city": "Pune"},
                                          "boundingbox": ["18.5", "18.6", "73.8", "73.9"]}])

    install_transport(monkeypatch, handler)
    monkeypatch.setattr(locations, "_last_request", -100)
    result = client.get("/api/v1/locations/search?q=Pune").json()["data"]
    assert result["results"][0]["city"] == "Pune"


def archive_fixture(amounts=None, dates=None):
    return {"daily_units": {"precipitation_sum": "mm"},
            "daily": {"time": dates or ["2025-01-01", "2025-01-02", "2025-01-03"],
                      "precipitation_sum": amounts or [5, 0, 20]}}


@pytest.mark.parametrize("runtime", ["persistent", "serverless"])
def test_historical_coordinate_request_and_persistent_regional_cache(db_session, monkeypatch, tmp_path, runtime):
    monkeypatch.setattr(archive, "ROOT", tmp_path)
    monkeypatch.setattr(archive.settings, "runtime_mode", runtime)
    calls = []

    def handler(request):
        calls.append(request)
        assert request.url.params["latitude"] == "19.87" and request.url.params["longitude"] == "75.34"
        return httpx.Response(200, json=archive_fixture())

    install_transport(monkeypatch, handler)
    args = (db_session, 19.87, 75.34, "Asia/Kolkata", date(2025, 1, 1), date(2025, 1, 3))
    first = asyncio.run(archive.historical(*args))
    second = asyncio.run(archive.historical(*args))
    assert first["data_kind"] == "historical_reanalysis" and second["cache"]
    assert len(calls) == 1 and first["annual"][0]["total_mm"] == 25
    assert "regional" in first["limitations"][0].lower()
    if runtime == "serverless":
        assert not (tmp_path / "data").exists()
        from datetime import timedelta

        from sqlalchemy import select

        from app.models import LocationCache, now
        row = db_session.scalar(select(LocationCache))
        row.expires_at = now() - timedelta(seconds=1)
        db_session.commit()
        refreshed = asyncio.run(archive.historical(*args))
        assert not refreshed["cache"] and len(calls) == 2
        assert len(list(db_session.scalars(select(LocationCache)))) == 1


@pytest.mark.parametrize("raw", [archive_fixture([5, None, 4]), archive_fixture([5]),
                                     archive_fixture(dates=["2025-01-02", "2025-01-03", "2025-01-04"])])
def test_historical_incomplete_shifted_or_missing_rain_is_rejected(db_session, monkeypatch, tmp_path, raw):
    monkeypatch.setattr(archive, "ROOT", tmp_path)
    install_transport(monkeypatch, lambda request: httpx.Response(200, json=raw))
    with pytest.raises(HTTPException) as failure:
        asyncio.run(archive.historical(db_session, 19.87, 75.34, "Asia/Kolkata", date(2025, 1, 1), date(2025, 1, 3)))
    assert failure.value.status_code == 502
    assert list((tmp_path / "data" / "historical").glob("*.json")) == []


@pytest.mark.parametrize("start,end,provider,status", [
    (date(2025, 1, 3), date(2025, 1, 1), "open_meteo", 422),
    (date(1930, 1, 1), date(1930, 1, 3), "open_meteo", 422),
    (date(2025, 1, 1), date(2025, 1, 3), "unknown", 422),
    (date(2025, 1, 1), date(2025, 1, 3), "imd", 503),
])
def test_historical_access_and_coverage_constraints(db_session, start, end, provider, status):
    with pytest.raises(HTTPException) as failure:
        asyncio.run(archive.historical(db_session, 19.87, 75.34, "Asia/Kolkata", start, end, provider))
    assert failure.value.status_code == status


def test_imd_optional_access_separate_from_forecast(db_session, monkeypatch):
    monkeypatch.setattr(imd.settings, "imd_enabled", True)
    monkeypatch.setattr(imd.settings, "imd_request_headers", '{"X-Test":"fixture-only"}')
    install_transport(monkeypatch, lambda request: httpx.Response(200, json={"category": "AUTOMATED TEST spatial category"}))
    result = asyncio.run(imd.official_product("district_forecast"))
    assert result["provider"] == "IMD" and "not point rainfall" in result["limitations"][0]
    with pytest.raises(HTTPException) as failure:
        asyncio.run(imd.official_product("invalid"))
    assert failure.value.status_code == 422
    monkeypatch.setattr(imd.settings, "imd_request_headers", '[]')
    with pytest.raises(HTTPException) as failure:
        asyncio.run(imd.official_product("warnings"))
    assert failure.value.status_code == 502
