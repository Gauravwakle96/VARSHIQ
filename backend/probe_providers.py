"""Read-only live-provider check for the configured pilot; never registers test properties."""
import asyncio
import json
from datetime import date

from app.database import Base, SessionLocal, engine
from app.config import get_settings
from app.services.buildings.building_footprint_service import lookup
from app.services.rainfall.forecast_service import forecast
from app.services.rainfall.historical_service import historical
from app.services.locations import search


async def main():
    Base.metadata.create_all(engine)
    results = {}
    settings = get_settings()
    lat, lon = settings.pilot_latitude, settings.pilot_longitude
    with SessionLocal() as db:
        for name, call in [
            ("pilot_forecast", lambda: forecast(db, lat, lon, settings.pilot_timezone, 7, refresh=True)),
            ("mumbai_forecast", lambda: forecast(db, 19.076, 72.8777, "Asia/Kolkata", 7, refresh=True)),
            ("pune_forecast", lambda: forecast(db, 18.5204, 73.8567, "Asia/Kolkata", 7, refresh=True)),
            ("pilot_historical", lambda: historical(db, lat, lon, settings.pilot_timezone, date(2025, 1, 1), date(2025, 12, 31))),
            ("pilot_osm", lambda: lookup(db, lat, lon)),
            ("pilot_geocoding", lambda: search(db, settings.pilot_locality)),
            ("pune_geocoding", lambda: search(db, "Pune")),
        ]:
            try:
                data = await call()
                results[name] = {"status": "verified", "provider": data.get("provider", data.get("source")), "retrieved_at": data["retrieved_at"],
                                 "hourly_count": len(data.get("hourly", [])), "daily_count": len(data.get("daily", [])),
                                 "footprint_count": len(data.get("features", [])), "tomorrow": data.get("tomorrow", {}).get("date"),
                                 "data_kind": data.get("data_kind"), "spatial_resolution": data.get("spatial_resolution"),
                                 "coordinates": [data.get("latitude"), data.get("longitude")], "place_matches": len(data.get("results", []))}
            except Exception as exc:
                results[name] = {"status": "failed", "error_class": type(exc).__name__, "message": str(getattr(exc, "detail", "Provider unavailable"))}
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
