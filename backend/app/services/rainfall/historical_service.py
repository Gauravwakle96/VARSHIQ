import calendar
import hashlib
import json
from collections import defaultdict
from datetime import date, timedelta
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException

from app.config import ROOT, get_settings
from app.models import now
from app.services.rainfall.forecast_service import source_status, value

settings = get_settings()


def summarise(daily, provider, data_kind, latitude, longitude, resolution, attribution, limitations=None):
    annual = defaultdict(list)
    monthly_totals = defaultdict(lambda: defaultdict(list))
    seasons = defaultdict(float)
    expected = None
    for row in daily:
        day = date.fromisoformat(row["date"])
        if expected is not None and day != expected:
            raise ValueError("Historical rainfall must contain a complete consecutive daily series")
        expected = day + timedelta(days=1)
        rain = value(row["precipitation_mm"])
        annual[day.year].append((day, rain))
        monthly_totals[day.month][day.year].append((day, rain))
        season = (
            "monsoon_Jun_Sep"
            if 6 <= day.month <= 9
            else "pre_monsoon_Mar_May"
            if 3 <= day.month <= 5
            else "post_monsoon_Oct_Dec"
            if day.month >= 10
            else "winter_Jan_Feb"
        )
        seasons[season] += rain
    year_rows = [
        {
            "year": year,
            "total_mm": round(sum(amount for _, amount in rows), 3),
            "complete": len(rows) == (366 if calendar.isleap(year) else 365),
        }
        for year, rows in sorted(annual.items())
    ]
    month_rows = []
    for month, years in sorted(monthly_totals.items()):
        complete_totals = [
            sum(amount for _, amount in rows)
            for year, rows in years.items()
            if len(rows) == calendar.monthrange(year, month)[1]
        ]
        month_rows.append(
            {
                "month": month,
                "mean_mm": round(sum(complete_totals) / len(complete_totals), 3) if complete_totals else None,
                "sample_years": len(complete_totals),
                "complete_months_only": True,
            }
        )
    complete_years = [row["total_mm"] for row in year_rows if row["complete"]]
    baseline = sum(complete_years) / len(complete_years) if complete_years else None
    for row in year_rows:
        row["anomaly_mm"] = (
            round(row["total_mm"] - baseline, 3) if row["complete"] and baseline is not None else None
        )
    return {
        "provider": provider,
        "data_kind": data_kind,
        "retrieved_at": now().isoformat(),
        "latitude": latitude,
        "longitude": longitude,
        "coverage": {
            "start_date": daily[0]["date"] if daily else None,
            "end_date": daily[-1]["date"] if daily else None,
            "days": len(daily),
            "complete_daily_series": True,
        },
        "spatial_resolution": resolution,
        "attribution": attribution,
        "daily": daily,
        "annual": year_rows,
        "monthly": month_rows,
        "seasonal": [{"season": season, "total_mm": round(total, 3)} for season, total in seasons.items()],
        "annual_baseline_mm": baseline,
        "extremes": sorted(daily, key=lambda row: row["precipitation_mm"], reverse=True)[:10],
        "limitations": limitations
        or [
            "Regional data does not establish rainfall at individual roofs.",
            "Monthly averages use complete months only; anomalies use complete years within this selected period.",
            "A short selected period is not a long-term climate normal.",
        ],
        "attribution_url": "https://open-meteo.com/"
        if provider == "Open-Meteo Archive"
        else "https://mausam.imd.gov.in/",
    }


async def historical(db, latitude, longitude, timezone, start_date, end_date, provider="open_meteo"):
    if end_date < start_date or (end_date - start_date).days > 3660:
        raise HTTPException(422, "Select a consecutive historical period of at most ten years")
    if provider == "imd":
        from app.services.rainfall.imd_service import local_history

        return local_history(latitude, longitude, start_date, end_date)
    if provider != "open_meteo":
        raise HTTPException(422, "Unknown historical provider")
    if not settings.open_meteo_enabled:
        raise HTTPException(503, "Open-Meteo is disabled")
    if end_date > now().astimezone(ZoneInfo(timezone)).date() - timedelta(days=5):
        raise HTTPException(422, "ERA5 historical data requires an end date at least five days ago")
    if start_date < date(1940, 1, 1):
        raise HTTPException(422, "This historical provider supports data from 1940")
    key = hashlib.sha256(
        f"{latitude:.5f}:{longitude:.5f}:{timezone}:{start_date}:{end_date}:era5".encode()
    ).hexdigest()
    directory = ROOT / "data" / "historical"
    directory.mkdir(parents=True, exist_ok=True)
    cache_file = directory / f"{key}.json"
    if cache_file.exists():
        return {**json.loads(cache_file.read_text(encoding="utf-8")), "cache": True}
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": str(start_date),
        "end_date": str(end_date),
        "daily": "precipitation_sum",
        "timezone": timezone,
        "models": "era5",
    }
    base = "https://archive-api.open-meteo.com/v1/archive"
    if settings.open_meteo_commercial:
        if not settings.open_meteo_api_key:
            raise HTTPException(503, "Commercial weather credentials are not configured")
        base = "https://customer-archive-api.open-meteo.com/v1/archive"
        params["apikey"] = settings.open_meteo_api_key
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.get(base, params=params)
            response.raise_for_status()
            raw = response.json()
        if raw.get("daily_units", {}).get("precipitation_sum") != "mm":
            raise ValueError("Unexpected historical precipitation units")
        dates, amounts = raw["daily"]["time"], raw["daily"]["precipitation_sum"]
        if len(dates) != len(amounts) or len(dates) != (end_date - start_date).days + 1:
            raise ValueError("Historical provider returned incomplete data")
        if not dates or dates[0] != str(start_date) or dates[-1] != str(end_date):
            raise ValueError("Historical provider coverage differs from the requested period")
        daily = [
            {"date": day, "precipitation_mm": value(amount)}
            for day, amount in zip(dates, amounts, strict=True)
        ]
        data = summarise(
            daily,
            "Open-Meteo Archive",
            "historical_reanalysis",
            latitude,
            longitude,
            "ERA5 0.25° (~25 km); reanalysis, not an IMD or rooftop observation",
            "Weather data by Open-Meteo.com; ERA5 by ECMWF/Copernicus — CC BY 4.0",
        )
        data["cache"] = False
        cache_file.write_text(json.dumps(data, allow_nan=False), encoding="utf-8")
        source_status(db, "Open-Meteo Archive", "connected", "Actual ERA5 historical reanalysis retrieved")
        db.commit()
        return data
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        source_status(
            db, "Open-Meteo Archive", "unavailable", "Historical data retrieval or validation failed"
        )
        db.commit()
        raise HTTPException(
            502, "Historical rainfall provider unavailable or returned incomplete data"
        ) from exc
