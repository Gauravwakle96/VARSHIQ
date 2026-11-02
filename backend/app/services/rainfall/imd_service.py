import json
from datetime import date
from pathlib import Path

import httpx
from fastapi import HTTPException

from app.config import get_settings
from app.services.rainfall.forecast_service import value

settings = get_settings()
IMD_ENDPOINTS = {
    "district_forecast": "state_district_rainfall_forecast",
    "subdivision_forecast": "subdivision_rainfall_forecast",
    "city_forecast": "cityforecastloc",
    "warnings": "districtwarning",
    "observations": "districtrainfall",
}


async def official_product(product):
    if not settings.imd_enabled:
        raise HTTPException(503, "Optional IMD provider is disabled; Open-Meteo remains available")
    if product not in IMD_ENDPOINTS:
        raise HTTPException(422, "Unknown IMD product")
    try:
        headers = json.loads(settings.imd_request_headers)
        if not isinstance(headers, dict) or any(
            not isinstance(k, str) or not isinstance(v, str) for k, v in headers.items()
        ):
            raise ValueError("Invalid header configuration")
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.get(
                f"https://api.imd.gov.in/api/v1/{IMD_ENDPOINTS[product]}", headers=headers
            )
            response.raise_for_status()
        return {
            "provider": "IMD",
            "product": product,
            "raw_product": response.json(),
            "limitations": [
                "District/subdivision forecast spatial-distribution categories are not point rainfall amounts or probabilities.",
                "This official product is displayed separately and is not merged into Open-Meteo WaterTwin calculations.",
                "IMD city 24-hour observations may use 08:30 IST boundaries.",
            ],
        }
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            502, "IMD access unavailable; check official access requirements and configured headers"
        ) from exc


def local_history(latitude, longitude, start_date: date, end_date: date):
    if not settings.imd_data_terms_accepted or not settings.imd_approved_data_dir:
        raise HTTPException(
            503, "IMD history requires approved local data and accepted dataset usage conditions"
        )
    directory = Path(settings.imd_approved_data_dir).resolve()
    if not directory.is_dir():
        raise HTTPException(503, "Approved IMD data directory is unavailable")
    try:
        import imdlib as imd

        # Read approved local files only. Never call get_data/load here: these may download nationwide data.
        data = imd.open_data(
            "rain", start_date.year, end_date.year, fn_format="yearwise", file_dir=str(directory)
        )
        grid = data.get_xarray()
        point = grid.sel(lat=latitude, lon=longitude, method="nearest").sel(
            time=slice(str(start_date), str(end_date))
        )
        array = point["rain"]
        daily = [
            {"date": str(timestamp)[:10], "precipitation_mm": value(float(amount))}
            for timestamp, amount in zip(array.time.values, array.values, strict=True)
        ]
        if len(daily) != (end_date - start_date).days + 1:
            raise ValueError("Incomplete approved IMD coverage")
        from app.services.rainfall.historical_service import summarise

        result = summarise(
            daily,
            "IMD gridded / IMDLIB",
            "historical_gridded_observation",
            latitude,
            longitude,
            "0.25° (~25 km) regional grid; nearest grid cell, not individual-roof rainfall",
            "India Meteorological Department dataset; IMDLIB MIT ©2019–2020 Saswata Nandi",
        )
        result["grid_cell"] = {"latitude": float(point.lat), "longitude": float(point.lon)}
        result["dataset_usage"] = (
            "Locally supplied approved data; redistribution rights remain separate from IMDLIB MIT code"
        )
        # Regional extract only; optional efficient Parquet output when that dependency group is installed.
        import pandas as pd

        from app.config import ROOT

        regional = ROOT / "data" / "imd_regional"
        regional.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(daily).to_parquet(
            regional / f"{latitude:.4f}_{longitude:.4f}_{start_date}_{end_date}.parquet", index=False
        )
        return result
    except ImportError as exc:
        raise HTTPException(
            503, "Install the historical optional dependency group to process approved IMD files"
        ) from exc
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(
            502, "Approved IMD files are missing, invalid or do not cover the requested period"
        ) from exc
