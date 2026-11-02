import logging
import math
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException
from sqlalchemy import select

from app.config import get_settings
from app.models import DataSource, WeatherForecast, now
from app.security import utc

settings = get_settings()


def source_status(db, name, status, message):
    record = db.scalar(select(DataSource).where(DataSource.name == name))
    if record is None:
        record = DataSource(name=name)
        db.add(record)
    previous = dict(record.status or {})
    record.status = {
        "name": name,
        "status": status,
        "message": message,
        "checked_at": now().isoformat(),
        "last_success": now().isoformat() if status == "connected" else previous.get("last_success"),
    }


def value(number, minimum=0, maximum=1e6, nullable=False):
    if number is None and nullable:
        return None
    if not isinstance(number, (int, float)) or isinstance(number, bool) or not math.isfinite(number):
        raise ValueError("Provider returned a missing or non-finite weather value")
    if not minimum <= number <= maximum:
        raise ValueError("Provider returned an out-of-range weather value")
    return float(number)


def parse_forecast(raw, latitude, longitude, timezone, days, retrieved_at=None):
    zone = ZoneInfo(timezone)
    retrieved_at = retrieved_at or now()
    today = retrieved_at.astimezone(zone).date()
    tomorrow = today + timedelta(days=1)
    hourly_raw, daily_raw = raw["hourly"], raw["daily"]
    hourly_fields = ["precipitation", "precipitation_probability", "rain", "showers"]
    daily_fields = ["precipitation_sum", "precipitation_probability_max", "precipitation_hours"]
    if raw.get("hourly_units", {}).get("precipitation") != "mm":
        raise ValueError("Expected precipitation units mm")
    if raw.get("daily_units", {}).get("precipitation_sum") != "mm":
        raise ValueError("Expected daily precipitation units mm")
    if any(len(hourly_raw[field]) != len(hourly_raw["time"]) for field in hourly_fields):
        raise ValueError("Hourly provider arrays have different lengths")
    if any(len(daily_raw[field]) != len(daily_raw["time"]) for field in daily_fields):
        raise ValueError("Daily provider arrays have different lengths")
    hourly, antecedent = [], []
    for index, timestamp in enumerate(hourly_raw["time"]):
        end = datetime.fromtimestamp(timestamp, UTC).astimezone(zone)
        start = datetime.fromtimestamp(timestamp - 3600, UTC).astimezone(zone)
        row = {
            "time": start.isoformat(),
            "source_interval_end": end.isoformat(),
            "precipitation_mm": value(hourly_raw["precipitation"][index]),
            "probability_pct": value(
                hourly_raw["precipitation_probability"][index], maximum=100, nullable=True
            ),
            "rain_mm": value(hourly_raw["rain"][index]),
            "showers_mm": value(hourly_raw["showers"][index]),
        }
        # Precipitation can include snowfall water equivalent; collection uses liquid rain + showers.
        row["liquid_rainfall_mm"] = row["rain_mm"] + row["showers_mm"]
        if start.date() < today:
            antecedent.append(row)
        elif start.date() < today + timedelta(days=days):
            hourly.append(row)
    daily = []
    for index, timestamp in enumerate(daily_raw["time"]):
        day = datetime.fromtimestamp(timestamp, UTC).astimezone(zone).date()
        if today <= day < today + timedelta(days=days):
            daily.append(
                {
                    "date": day.isoformat(),
                    "precipitation_mm": value(daily_raw["precipitation_sum"][index]),
                    "probability_pct": value(
                        daily_raw["precipitation_probability_max"][index], maximum=100, nullable=True
                    ),
                    "precipitation_hours": value(daily_raw["precipitation_hours"][index], maximum=24),
                }
            )
    if len(hourly) != days * 24 or len(daily) != days:
        # Pilot uses Asia/Kolkata without DST; other zones require actual elapsed-day hours.
        expected_hours = sum(
            int(
                (
                    datetime.combine(today + timedelta(days=i + 1), datetime.min.time(), zone).astimezone(UTC)
                    - datetime.combine(today + timedelta(days=i), datetime.min.time(), zone).astimezone(UTC)
                ).total_seconds()
                / 3600
            )
            for i in range(days)
        )
        if len(hourly) != expected_hours or len(daily) != days:
            raise ValueError("Provider forecast does not cover the complete requested horizon")
    tomorrow_daily = next((row for row in daily if row["date"] == tomorrow.isoformat()), None)
    return {
        "provider": "Open-Meteo",
        "retrieved_at": retrieved_at.isoformat(),
        "issue_time": None,
        "timezone": timezone,
        "latitude": latitude,
        "longitude": longitude,
        "model_latitude": raw.get("latitude"),
        "model_longitude": raw.get("longitude"),
        "spatial_resolution": "Model dependent (~1–25 km); ensemble probability ~27 km. Regional forecast, not roof measurement.",
        "stale": False,
        "cache": False,
        "attribution": "Weather data by Open-Meteo.com — CC BY 4.0; hourly labels normalised to interval starts.",
        "attribution_url": "https://open-meteo.com/",
        "licence_url": "https://creativecommons.org/licenses/by/4.0/",
        "hourly": hourly,
        "daily": daily,
        "antecedent": antecedent,
        "tomorrow": {
            **(
                tomorrow_daily
                or {"date": tomorrow.isoformat(), "precipitation_mm": None, "probability_pct": None}
            ),
            "hourly": [row for row in hourly if datetime.fromisoformat(row["time"]).date() == tomorrow],
        },
        "limitations": [
            "Retrieval time is known; provider issue time is not supplied by this endpoint.",
            "Probability is separate from forecast amount and is never multiplied into collection.",
            "WaterTwin uses rain + showers; total precipitation may include snow water equivalent.",
            "Forecast grid information is regional and does not verify individual rooftop rainfall.",
        ],
    }


async def forecast(db, latitude, longitude, timezone="Asia/Kolkata", days=7, property_id=None, refresh=False):
    if not settings.open_meteo_enabled:
        raise HTTPException(503, "Open-Meteo is disabled in provider settings")
    if not -85 <= latitude <= 85 or not -180 <= longitude <= 180 or not 1 <= days <= 14:
        raise HTTPException(422, "Invalid coordinates or forecast horizon")
    try:
        ZoneInfo(timezone)
    except (ValueError, KeyError) as exc:
        raise HTTPException(422, "Invalid IANA timezone") from exc
    cache_key = f"open_meteo:{latitude:.5f}:{longitude:.5f}:{timezone}:{days}"
    cached = db.scalar(
        select(WeatherForecast)
        .where(WeatherForecast.cache_key == cache_key, WeatherForecast.property_id == property_id)
        .order_by(WeatherForecast.retrieved_at.desc())
    )
    if (
        cached
        and not refresh
        and now() - utc(cached.retrieved_at) < timedelta(minutes=settings.forecast_cache_minutes)
        and utc(cached.retrieved_at).astimezone(ZoneInfo(timezone)).date()
        == now().astimezone(ZoneInfo(timezone)).date()
    ):
        return {**cached.payload, "id": cached.id, "cache": True, "stale": False}
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "timezone": timezone,
        "hourly": "precipitation,precipitation_probability,rain,showers",
        "daily": "precipitation_sum,precipitation_probability_max,precipitation_hours",
        "forecast_days": days + 1,
        "past_days": 1,
        "timeformat": "unixtime",
    }
    base = "https://api.open-meteo.com/v1/forecast"
    if settings.open_meteo_commercial:
        if not settings.open_meteo_api_key:
            raise HTTPException(503, "Commercial Open-Meteo credentials are not configured")
        base = "https://customer-api.open-meteo.com/v1/forecast"
        params["apikey"] = settings.open_meteo_api_key
    try:
        async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
            response = await client.get(base, params=params)
            response.raise_for_status()
            data = parse_forecast(response.json(), latitude, longitude, timezone, days)
        record = WeatherForecast(
            property_id=property_id, cache_key=cache_key, provider="Open-Meteo", payload=data
        )
        db.add(record)
        source_status(
            db, "Open-Meteo", "connected", "Actual forecast retrieved; CC BY 4.0 attribution applies"
        )
        db.commit()
        return {**data, "id": record.id}
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        logging.getLogger("varshiq").warning("Forecast provider failure class: %s", type(exc).__name__)
        source_status(db, "Open-Meteo", "unavailable", "Forecast retrieval or provider validation failed")
        db.commit()
        if cached and now() - utc(cached.retrieved_at) < timedelta(hours=24):
            tomorrow_date = (now().astimezone(ZoneInfo(timezone)).date() + timedelta(days=1)).isoformat()
            tomorrow_row = next(
                (row for row in cached.payload.get("daily", []) if row["date"] == tomorrow_date), None
            )
            return {
                **cached.payload,
                "id": cached.id,
                "cache": True,
                "stale": True,
                "tomorrow": {
                    **(
                        tomorrow_row
                        or {"date": tomorrow_date, "precipitation_mm": None, "probability_pct": None}
                    ),
                    "hourly": [
                        row for row in cached.payload.get("hourly", []) if row["time"][:10] == tomorrow_date
                    ],
                    "available": tomorrow_row is not None,
                },
                "status_message": "Provider unavailable; showing the timestamped previous forecast",
            }
        raise HTTPException(
            502, "Weather provider unavailable or returned invalid data; retry later"
        ) from exc
