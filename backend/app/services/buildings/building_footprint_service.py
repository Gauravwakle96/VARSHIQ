import csv
import gzip
import io
import json
import math
from datetime import datetime, timedelta
from xml.etree.ElementTree import ParseError

import httpx
from defusedxml.common import DefusedXmlException
from defusedxml.ElementTree import fromstring
from fastapi import HTTPException
from shapely.geometry import box, shape

from app.config import get_settings
from app.models import now
from app.services.rainfall.forecast_service import source_status

settings = get_settings()
_cache = {}


def quadkey(latitude, longitude, zoom=9):
    latitude = min(85.05112878, max(-85.05112878, latitude))
    x = int((longitude + 180) / 360 * (1 << zoom))
    sin_lat = math.sin(math.radians(latitude))
    y = int((0.5 - math.log((1 + sin_lat) / (1 - sin_lat)) / (4 * math.pi)) * (1 << zoom))
    return "".join(
        str((1 if x & (1 << (level - 1)) else 0) + (2 if y & (1 << (level - 1)) else 0))
        for level in range(zoom, 0, -1)
    )


async def lookup(db, latitude, longitude, provider="osm"):
    if not -85 <= latitude <= 85 or not -180 <= longitude <= 180:
        raise HTTPException(422, "Invalid building lookup coordinates")
    key = (provider, round(latitude, 4), round(longitude, 4))
    if key in _cache and now() - datetime.fromisoformat(_cache[key]["retrieved_at"]) < timedelta(days=1):
        return {**_cache[key], "cache": True}
    try:
        if provider == "osm":
            if not settings.osm_enabled:
                raise HTTPException(503, "OpenStreetMap lookup is disabled")
            radius = 0.003
            query = f"[out:json][timeout:20];way[building]({latitude - radius},{longitude - radius},{latitude + radius},{longitude + radius});out geom 300;"
            async with httpx.AsyncClient(timeout=30) as client:
                try:
                    response = await client.post(settings.overpass_url, data={"data": query})
                    response.raise_for_status()
                    raw = response.json()
                except (httpx.HTTPError, ValueError):
                    raw = await osm_core_extract(client, latitude, longitude)
            features = []
            for element in raw.get("elements", []):
                coords = [[point["lon"], point["lat"]] for point in element.get("geometry", [])]
                if len(coords) < 4 or coords[0] != coords[-1]:
                    continue
                geometry = {"type": "Polygon", "coordinates": [coords]}
                polygon = shape(geometry)
                if not polygon.is_valid or polygon.is_empty:
                    continue
                tags = element.get("tags", {})
                features.append(
                    {
                        "type": "Feature",
                        "id": str(element["id"]),
                        "geometry": geometry,
                        "properties": {
                            "name": tags.get("name", "Mapped building"),
                            "building": tags.get("building"),
                            "source": "osm",
                            "source_id": str(element["id"]),
                            "source_uri": f"https://www.openstreetmap.org/way/{element['id']}",
                            "measurement_status": "geospatial_estimate",
                        },
                    }
                )
            attribution = "© OpenStreetMap contributors — ODbL 1.0"
            limitations = [
                "Mapped building outlines are estimates and may be missing or outdated.",
                "Only building ways are retrieved; complex relations require manual correction.",
                "Footprint area does not establish connected rooftop catchment area.",
            ]
        elif provider == "microsoft":
            if not settings.microsoft_enabled:
                raise HTTPException(
                    503,
                    "Microsoft footprints disabled; enable locality tile access after reviewing CDLA terms",
                )
            features = await microsoft_extract(latitude, longitude)
            attribution = "Microsoft Global ML Building Footprints — CDLA Permissive 2.0"
            limitations = [
                "Model-derived footprint, height and detection confidence are not field verification.",
                "Only the required quadkey tile was processed; download/decompression limits apply.",
            ]
        else:
            raise HTTPException(422, "Choose osm or microsoft; manual drawing is always available")
        result = {
            "features": features,
            "provider": provider,
            "retrieved_at": now().isoformat(),
            "attribution": attribution,
            "limitations": limitations,
            "cache": False,
        }
        if len(_cache) >= 64:
            _cache.pop(next(iter(_cache)))
        _cache[key] = result
        if db is not None:
            source_status(
                db,
                "OpenStreetMap" if provider == "osm" else "Microsoft Footprints",
                "connected",
                f"Actual geographic lookup returned {len(features)} footprints",
            )
            db.commit()
        return result
    except (httpx.HTTPError, ValueError, KeyError, TypeError, OSError, ParseError, DefusedXmlException) as exc:
        if db is not None:
            source_status(
                db,
                "OpenStreetMap" if provider == "osm" else "Microsoft Footprints",
                "unavailable",
                "Building lookup failed",
            )
            db.commit()
        raise HTTPException(
            502, "Building provider unavailable; retry or register using a manually drawn polygon"
        ) from exc


async def osm_core_extract(client, latitude, longitude):
    """Small official map extract fallback when Overpass is unavailable."""
    radius = 0.002
    bbox = f"{longitude - radius},{latitude - radius},{longitude + radius},{latitude + radius}"
    content = bytearray()
    async with client.stream(
        "GET",
        "https://api.openstreetmap.org/api/0.6/map",
        params={"bbox": bbox},
        headers={"User-Agent": "VARSHIQ/0.1 locality-building-lookup"},
    ) as response:
        response.raise_for_status()
        async for chunk in response.aiter_bytes():
            content.extend(chunk)
            if len(content) > 10_000_000:
                raise ValueError("Local map extract exceeds safe size; use manual registration")
    root = fromstring(bytes(content))
    nodes = {
        node.attrib["id"]: {"lat": float(node.attrib["lat"]), "lon": float(node.attrib["lon"])}
        for node in root.findall("node")
    }
    elements = []
    for way in root.findall("way"):
        tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
        refs = [node.attrib["ref"] for node in way.findall("nd")]
        if (
            "building" not in tags
            or len(refs) < 4
            or refs[0] != refs[-1]
            or any(ref not in nodes for ref in refs)
        ):
            continue
        elements.append({"id": way.attrib["id"], "tags": tags, "geometry": [nodes[ref] for ref in refs]})
        if len(elements) >= 300:
            break
    return {"elements": elements, "access_path": "official_osm_core_api_fallback"}


async def microsoft_extract(latitude, longitude):
    key = quadkey(latitude, longitude)
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(settings.microsoft_index_url)
        response.raise_for_status()
        if len(response.content) > 10_000_000:
            raise ValueError("Building index exceeds configured safe scope")
        rows = [
            row
            for row in csv.DictReader(io.StringIO(response.text))
            if str(row.get("QuadKey", "")).zfill(9) == key
        ]
        if not rows:
            return []
        if len(rows) > 2:
            raise ValueError("Lookup spans too many country tiles; use a smaller approved extract")
        features = []
        bounds = box(longitude - 0.003, latitude - 0.003, longitude + 0.003, latitude + 0.003)
        for row in rows:
            url = row.get("Url", "")
            if not url.startswith(
                ("https://bfppub.blob.core.windows.net/", "https://minedbuildings.z5.web.core.windows.net/")
            ):
                raise ValueError("Building index contains an unapproved tile host")
            compressed = bytearray()
            async with client.stream("GET", url) as tile:
                tile.raise_for_status()
                async for chunk in tile.aiter_bytes():
                    compressed.extend(chunk)
                    if len(compressed) > settings.microsoft_tile_max_bytes:
                        raise ValueError(
                            "Locality tile exceeds download budget; use OSM or manual registration"
                        )
            expanded = 0
            with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
                while line := stream.readline(2_000_001):
                    expanded += len(line)
                    if expanded > 250_000_000 or len(line) > 2_000_000:
                        raise ValueError("Locality tile exceeds decompression budget")
                    feature = json.loads(line)
                    polygon = shape(feature["geometry"])
                    if polygon.is_valid and polygon.intersects(bounds):
                        props = feature.get("properties", {})
                        feature["properties"] = {
                            **props,
                            "source": "microsoft",
                            "source_uri": url,
                            "height_m": props.get("height") if props.get("height", -1) >= 0 else None,
                            "detection_confidence": props.get("confidence")
                            if props.get("confidence", -1) >= 0
                            else None,
                            "measurement_status": "geospatial_estimate",
                        }
                        features.append(feature)
                        if len(features) > 300:
                            raise ValueError("Too many nearby footprints; use a narrower extract")
        return features
