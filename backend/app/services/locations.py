"""Bounded explicit-submit OSM geocoding; never a provider enumeration pipeline."""
import asyncio
import hashlib
import json
import math
import time
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from app.config import get_settings
from app.models import LocationCache, now
from app.security import utc
from app.services.rainfall.forecast_service import source_status

ATTRIBUTION = "© OpenStreetMap contributors — ODbL 1.0"
_request_lock = asyncio.Lock()
_last_request = 0.0


def district_directory(state="Maharashtra"):
    if state.casefold() != "maharashtra":
        return {"districts": [], "source": "Not configured for this state", "licence": None,
                "retrieved_at": None, "limitations": ["Live locality search remains available throughout India; an official directory for this state has not been imported."]}
    return json.loads((Path(__file__).resolve().parents[1] / "data" / "maharashtra-districts.json").read_text(encoding="utf-8"))


def current_district(name):
    stripped = name.removesuffix(" District").removesuffix(" district").strip()
    for row in district_directory()["districts"]:
        if stripped.casefold() in [value.casefold() for value in [row["name"], row["source_name"], *row["aliases"]]]:
            return row["name"]
    return stripped


def coordinate(value, lower, upper):
    try:
        parsed = float(value)
    except (ValueError, TypeError) as exc:
        raise ValueError("Geocoder coordinate missing or invalid") from exc
    if isinstance(value, bool) or not math.isfinite(parsed) or not lower <= parsed <= upper:
        raise ValueError("Geocoder coordinate out of range")
    return parsed


def normalise(raw, provider):
    if provider == "photon":
        properties = raw["properties"]
        longitude, latitude = raw["geometry"]["coordinates"]
        country = str(properties.get("countrycode", "")).upper()
        state = str(properties.get("state", ""))
        district = current_district(str(properties.get("county", ""))) if state.casefold() == "maharashtra" else str(properties.get("county", ""))
        city = current_district(str(properties.get("city", ""))) if state.casefold() == "maharashtra" else str(properties.get("city", ""))
        locality = str(properties.get("district", ""))
        postcode = str(properties.get("postcode", ""))
        identifier = f"{properties.get('osm_type', '')}:{properties.get('osm_id', '')}"
        original_name = str(properties.get("name", properties.get("street", "")))
        name = current_district(original_name) if state.casefold() == "maharashtra" else original_name
        display = ", ".join(dict.fromkeys(value for value in [name, locality, city, district, state, properties.get("country", ""), postcode] if value))
        bbox = None
        if properties.get("extent"):
            west, north, east, south = properties["extent"]
            bbox = [coordinate(south, -90, 90), coordinate(north, -90, 90), coordinate(west, -180, 180), coordinate(east, -180, 180)]
    else:
        address = raw.get("address", {})
        longitude, latitude = raw["lon"], raw["lat"]
        country = str(address.get("country_code", "")).upper()
        state = str(address.get("state", ""))
        district = current_district(str(address.get("state_district", address.get("county", "")))) if state.casefold() == "maharashtra" else str(address.get("state_district", address.get("county", "")))
        city = str(address.get("city", address.get("town", address.get("village", ""))))
        if state.casefold() == "maharashtra":
            city = current_district(city)
        locality = str(address.get("suburb", address.get("neighbourhood", "")))
        postcode = str(address.get("postcode", ""))
        identifier = f"{raw.get('osm_type', '')}:{raw.get('osm_id', raw.get('place_id', ''))}"
        display = str(raw["display_name"])
        bbox = [coordinate(v, -180, 180) for v in raw["boundingbox"]] if raw.get("boundingbox") else None
    return {"id": identifier, "display_name": display, "latitude": coordinate(latitude, -85, 85),
            "longitude": coordinate(longitude, -180, 180), "country": country, "state": state,
            "district": district, "city": city, "locality": locality, "postcode": postcode,
            "timezone": "Asia/Kolkata" if country == "IN" else "UTC", "bbox": bbox,
            "source": "osm", "provider": "Photon" if provider == "photon" else "Nominatim",
            "attribution": ATTRIBUTION, "attribution_url": "https://www.openstreetmap.org/copyright",
            "administrative_ids": {"osm_place": identifier},
            "limitations": ["Geocoded administrative context is an estimate requiring confirmation; no roof measurement is verified.",
                             "India uses Asia/Kolkata; other countries use a UTC placeholder requiring an explicit property timezone."]}


async def request_geocoder(db, action, params):
    global _last_request
    settings = get_settings()
    provider = settings.geocoding_provider
    if not settings.geocoding_enabled:
        raise HTTPException(503, "Geocoding is disabled; use manual coordinates or map selection")
    if provider not in {"photon", "nominatim"}:
        raise HTTPException(503, "Configure a supported geocoder; manual coordinates remain available")
    base = settings.geocoding_base_url or ("https://photon.komoot.io" if provider == "photon" else "https://nominatim.openstreetmap.org")
    if provider == "nominatim" and urlparse(base).hostname == "nominatim.openstreetmap.org" and not settings.geocoding_nominatim_policy_accepted:
        raise HTTPException(503, "Public Nominatim requires the developer's informed policy acceptance; configure Photon or a self-hosted provider")
    key = hashlib.sha256(json.dumps([base, provider, action, params], sort_keys=True).encode()).hexdigest()
    async with _request_lock:
        cached = db.get(LocationCache, key)
        if cached and utc(cached.expires_at) > now():
            return {**cached.payload, "cache": True}
        delay = 1.1 - (time.monotonic() - _last_request)
        if delay > 0:
            await asyncio.sleep(delay)
        _last_request = time.monotonic()
        try:
            path = ("/api" if action == "search" else "/reverse") if provider == "photon" else f"/{action}"
            async with httpx.AsyncClient(timeout=20, headers={"User-Agent": settings.geocoding_user_agent}) as client:
                response = await client.get(base.rstrip("/") + path, params=params)
                response.raise_for_status()
                if len(response.content) > 2_000_000:
                    raise ValueError("Oversized geocoder response")
                raw = response.json()
            raw_results = raw["features"] if provider == "photon" else raw if action == "search" else [raw]
            if not isinstance(raw_results, list) or len(raw_results) > 40:
                raise ValueError("Invalid geocoder result count")
            results = [normalise(row, provider) for row in raw_results]
            payload = {"results": results, "source": "Photon / OpenStreetMap" if provider == "photon" else "Nominatim / OpenStreetMap",
                       "attribution": ATTRIBUTION, "attribution_url": "https://www.openstreetmap.org/copyright",
                       "retrieved_at": now().isoformat(), "cache": False,
                       "limitations": ["User-submit search only; place/PIN/address coverage depends on OSM.",
                                        "Public geocoding has limited availability; manual map coordinates remain available."]}
            if cached:
                cached.payload = payload
                cached.expires_at = now() + timedelta(days=7)
            else:
                db.add(LocationCache(key=key, expires_at=now() + timedelta(days=7), payload=payload))
            source_status(db, "Geocoding", "connected", "Actual bounded OSM-based location search/reverse lookup retrieved")
            db.commit()
            return payload
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            source_status(db, "Geocoding", "unavailable", "Geocoder retrieval or validation failed; enter coordinates instead")
            db.commit()
            raise HTTPException(502, "Location provider unavailable or returned invalid data; try again or use map/manual coordinates") from exc


async def search(db, query, country="IN", state="Maharashtra"):
    provider = get_settings().geocoding_provider
    # State is appended to free-text rather than mixed with Nominatim structured fields.
    text = ", ".join([query, *([state] if state and state.casefold() not in query.casefold() else [])])
    if provider == "photon":
        params = {"q": text, "limit": 20, "lang": "en"}
        if country:
            params["countrycode"] = country.upper()
    else:
        params = {"q": text, "format": "jsonv2", "addressdetails": 1, "limit": 20, "accept-language": "en"}
        if country:
            params["countrycodes"] = country.lower()
    data = await request_geocoder(db, "search", params)
    data["results"] = [row for row in data["results"] if (not country or row["country"] == country.upper())
                       and (not state or row["state"].casefold() == state.casefold())]
    return data


async def reverse(db, latitude, longitude):
    if get_settings().geocoding_provider == "photon":
        params = {"lat": latitude, "lon": longitude, "limit": 1, "lang": "en"}
    else:
        params = {"lat": latitude, "lon": longitude, "format": "jsonv2", "addressdetails": 1, "accept-language": "en"}
    data = await request_geocoder(db, "reverse", params)
    if not data["results"]:
        raise HTTPException(404, "No indexed address is available here; retain coordinates and enter the locality manually")
    return {**data["results"][0], "latitude": latitude, "longitude": longitude,
            "retrieved_at": data["retrieved_at"], "cache": data["cache"],
            "limitations": [*data["results"][0]["limitations"], "Reverse lookup is the nearest indexed address; entered/GPS coordinates are retained without snapping."]}
