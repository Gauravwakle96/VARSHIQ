"""Synthetic provider responses are automated test fixtures, never app records."""

import asyncio
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest
from test_api import fixture_property, signup

from app.models import WeatherForecast
from app.services.rainfall import forecast_service as service
from app.services.rainfall.forecast_service import parse_forecast
from app.services.rainfall.historical_service import summarise

ORIGINAL_CLIENT = httpx.AsyncClient


def raw_forecast(retrieved=None, timezone="Asia/Kolkata", days=7):
    zone = ZoneInfo(timezone)
    current = retrieved or datetime.now(UTC)
    today = current.astimezone(zone).date()
    first = datetime.combine(today - timedelta(days=1), datetime.min.time(), zone).astimezone(UTC)
    last = datetime.combine(today + timedelta(days=days + 1), datetime.min.time(), zone).astimezone(UTC)
    stamps = [
        int((first + timedelta(hours=i)).timestamp())
        for i in range(int((last - first).total_seconds() / 3600) + 1)
    ]
    count = len(stamps)
    daily = [
        int(datetime.combine(today + timedelta(days=i), datetime.min.time(), zone).timestamp())
        for i in range(days + 1)
    ]
    return {
        "latitude": 19.08,
        "longitude": 72.88,
        "hourly_units": {"precipitation": "mm"},
        "daily_units": {"precipitation_sum": "mm"},
        "hourly": {
            "time": stamps,
            "precipitation": [2.0] * count,
            "rain": [1.5] * count,
            "showers": [0.5] * count,
            "precipitation_probability": [75] * count,
        },
        "daily": {
            "time": daily,
            "precipitation_sum": [48] * (days + 1),
            "precipitation_probability_max": [90] * (days + 1),
            "precipitation_hours": [24] * (days + 1),
        },
    }


def install_transport(monkeypatch, handler):
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda *args, **kwargs: ORIGINAL_CLIENT(transport=transport, timeout=5)
    )


def test_provider_interval_labels_and_tomorrow_exact_date():
    retrieved = datetime(2026, 11, 2, 18, 20, tzinfo=UTC)  # 23:50 IST
    data = parse_forecast(raw_forecast(retrieved), 19.076, 72.8777, "Asia/Kolkata", 7, retrieved)
    assert data["tomorrow"]["date"] == "2026-11-03"
    assert len(data["hourly"]) == 168
    assert data["hourly"][0]["time"] == "2026-11-02T00:00:00+05:30"
    assert data["hourly"][0]["source_interval_end"] == "2026-11-02T01:00:00+05:30"
    assert data["hourly"][0]["precipitation_mm"] == 2  # not multiplied by 75%


@pytest.mark.parametrize("timezone,expected_start,expected_end", [
    ("Asia/Kolkata", "2026-11-02", "2026-11-10"),
    ("America/Los_Angeles", "2026-11-01", "2026-11-09"),
])
def test_request_horizon_uses_property_date_near_midnight(db_session, monkeypatch, timezone, expected_start, expected_end):
    instant = datetime(2026, 11, 2, 18, 31, tzinfo=UTC)
    monkeypatch.setattr(service, "now", lambda: instant)

    def handler(request):
        assert request.url.params["start_date"] == expected_start
        assert request.url.params["end_date"] == expected_end
        assert "forecast_days" not in request.url.params and "past_days" not in request.url.params
        return httpx.Response(200, json=raw_forecast(instant, timezone))

    install_transport(monkeypatch, handler)
    result = asyncio.run(service.forecast(db_session, 19.076, 72.8777, timezone, 7))
    assert len(result["hourly"]) == 168 and len(result["daily"]) == 7
    expected_tomorrow = (instant.astimezone(ZoneInfo(timezone)).date() + timedelta(days=1)).isoformat()
    assert result["tomorrow"]["date"] == expected_tomorrow


@pytest.mark.parametrize(
    "mutate",
    [
        lambda raw: raw["hourly"]["precipitation"].__setitem__(4, None),
        lambda raw: raw["hourly"]["precipitation_probability"].__setitem__(4, 200),
        lambda raw: raw["hourly_units"].__setitem__("precipitation", "inch"),
        lambda raw: raw["hourly"]["rain"].pop(),
        lambda raw: raw["daily"]["precipitation_sum"].pop(),
    ],
)
def test_invalid_provider_data_not_converted_to_zero(mutate):
    raw = raw_forecast()
    mutate(raw)
    with pytest.raises(ValueError):
        parse_forecast(raw, 19, 72, "Asia/Kolkata", 7)


@pytest.mark.parametrize(
    "day", [datetime(2026, 3, 6, 12, tzinfo=UTC), datetime(2026, 10, 30, 12, tzinfo=UTC)]
)
def test_provider_dst_intervals_are_unique_elapsed_hours(day):
    data = parse_forecast(raw_forecast(day, "America/New_York"), 40, -74, "America/New_York", 7, day)
    timestamps = [datetime.fromisoformat(row["time"]).astimezone(UTC) for row in data["hourly"]]
    assert all(second - first == timedelta(hours=1) for first, second in zip(timestamps, timestamps[1:], strict=False))
    assert len(set(timestamps)) == len(timestamps)


def test_forecast_cache_connected_and_no_extra_fetch(db_session, monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=raw_forecast())

    install_transport(monkeypatch, handler)
    first = asyncio.run(service.forecast(db_session, 19, 72))
    second = asyncio.run(service.forecast(db_session, 19, 72))
    assert first["cache"] is False and second["cache"] is True
    assert len(calls) == 1
    assert second["id"] == first["id"]


def test_midnight_cache_refresh_and_stale_tomorrow(db_session, monkeypatch):
    retrieved = datetime(2026, 11, 2, 18, 20, tzinfo=UTC)
    current = retrieved + timedelta(minutes=20)
    payload = parse_forecast(raw_forecast(retrieved), 19, 72, "Asia/Kolkata", 7, retrieved)
    record = WeatherForecast(
        cache_key="open_meteo:19.00000:72.00000:Asia/Kolkata:7",
        provider="TEST FIXTURE",
        retrieved_at=retrieved,
        payload=payload,
    )
    db_session.add(record)
    db_session.commit()
    monkeypatch.setattr(service, "now", lambda: current)
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(503)

    install_transport(monkeypatch, handler)
    result = asyncio.run(service.forecast(db_session, 19, 72))
    assert calls  # a 20-minute-old cache must be refreshed after local midnight
    assert result["stale"] is True
    assert result["tomorrow"]["date"] == "2026-11-04"
    assert result["tomorrow"]["available"] is True


def test_missing_forecast_failure_is_explicit(db_session, monkeypatch):
    install_transport(monkeypatch, lambda request: httpx.Response(500))
    with pytest.raises(Exception) as error:
        asyncio.run(service.forecast(db_session, 19, 72))
    assert error.value.status_code == 502


def test_historical_full_year_vs_partial_month():
    start = datetime(2025, 1, 1)
    daily = [
        {"date": (start + timedelta(days=i)).date().isoformat(), "precipitation_mm": 1} for i in range(365)
    ]
    data = summarise(daily, "TEST", "historical_reanalysis", 19, 72, "TEST", "TEST")
    assert data["annual"][0]["total_mm"] == 365
    assert data["annual"][0]["complete"] is True
    partial = summarise(daily[:5], "TEST", "historical_reanalysis", 19, 72, "TEST", "TEST")
    assert partial["annual"][0]["complete"] is False
    assert partial["monthly"][0]["mean_mm"] is None
    with pytest.raises(ValueError):
        summarise([daily[0], daily[2]], "TEST", "TEST", 19, 72, "TEST", "TEST")


def test_end_to_end_api_forecast_twin_input_updates_scenario(client, db_session, monkeypatch):
    install_transport(monkeypatch, lambda request: httpx.Response(200, json=raw_forecast()))
    csrf = signup(client)
    prop = fixture_property(client, csrf)
    headers = {"X-CSRF-Token": csrf}
    first = client.post("/api/v1/rainwater/forecast", json={"property_id": prop["id"]}, headers=headers)
    assert first.status_code == 200, first.text
    twin = first.json()["data"]
    start = datetime.fromisoformat(twin["calculation"]["hourly"][0]["time"])
    assert start.astimezone(UTC) > datetime.now(UTC)
    assert start.minute == 0  # local full hour, including half-hour UTC offset
    assert abs(twin["calculation"]["balance_error_l"]) < 1e-6
    assert (
        client.patch(
            f"/api/v1/buildings/{prop['id']}",
            json={"tank_capacity_l": 2000, "daily_demand_l": 200},
            headers=headers,
        ).status_code
        == 200
    )
    second = client.post(
        "/api/v1/rainwater/forecast", json={"property_id": prop["id"]}, headers=headers
    ).json()["data"]
    assert second["calculation"]["capacity_l"] == 2000
    assert second["assumptions"]["daily_demand_l"] == 200
    assert second["input_fingerprint"] != twin["input_fingerprint"]
    scenario = client.post(
        "/api/v1/rainwater/scenario",
        json={"property_id": prop["id"], "capacity_l": 3000, "daily_demand_l": 100},
        headers=headers,
    )
    assert scenario.status_code == 200
    assert scenario.json()["data"]["scenario"] is True
    assert client.get(f"/api/v1/buildings/{prop['id']}").json()["data"]["tank_capacity_l"] == 2000
    report = client.post("/api/v1/reports", json={"property_id": prop["id"]}, headers=headers).json()["data"]
    assert client.get(f"/api/v1/reports/{report['id']}/download").status_code == 200
    assert client.get("/api/v1/reports/locality/download").content.startswith(b"%PDF")


def test_oversized_chunked_request_blocked_before_parsing(client):
    def chunks():
        yield b"x" * 600000
        yield b"y" * 600000

    response = client.post(
        "/api/v1/auth/register", content=chunks(), headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413


def test_ai_unknown_fact_rejected(client, monkeypatch):
    from app import analytics

    csrf = signup(client)
    monkeypatch.setattr(analytics.settings, "ai_gateway_api_key", "AUTOMATED_TEST_NOT_REAL_KEY")
    monkeypatch.setattr(analytics.settings, "ai_gateway_model", "TEST_FIXTURE")
    install_transport(
        monkeypatch,
        lambda request: httpx.Response(
            200, json={"choices": [{"message": {"content": '{"fact_ids":["invented_aquifer"]}'}}]}
        ),
    )
    response = client.post(
        "/api/v1/assistant/chat",
        json={"message": "Tell me groundwater", "property_id": None},
        headers={"X-CSRF-Token": csrf},
    ).json()["data"]
    assert response["mode"] == "deterministic"
    assert "invented_aquifer" not in response["answer"]
