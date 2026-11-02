"""Read bounded operator-approved groundwater/soil records with spatial provenance.

File data is never promoted to certified site suitability or an aquifer model.
"""
import json
from pathlib import Path

from shapely.geometry import Point, shape

from app.config import get_settings

REQUIRED_PROVENANCE = {"source", "source_url", "dataset_date", "resolution", "coverage", "verification_status", "licence"}


def approved_records(latitude, longitude, kind):
    configured = getattr(get_settings(), f"{kind}_approved_file")
    if not configured:
        return [], "not_configured"
    path = Path(configured).resolve()
    if not path.is_file() or path.stat().st_size > 5_000_000:
        return [], "unavailable"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        json.dumps(data, allow_nan=False)
        if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list) or len(data["features"]) > 1000:
            raise ValueError("Supply a bounded approved GeoJSON FeatureCollection")
        records = []
        for feature in data["features"]:
            geometry = shape(feature["geometry"])
            if geometry.geom_type not in {"Polygon", "MultiPolygon"} or not geometry.is_valid or geometry.is_empty:
                raise ValueError("Approved source coverage must be a valid polygon")
            properties = feature["properties"]
            provenance = properties["provenance"]
            if not isinstance(provenance, dict) or not REQUIRED_PROVENANCE <= provenance.keys() or not all(provenance[key] for key in REQUIRED_PROVENANCE):
                raise ValueError("Dataset provenance and separate reuse licence are required")
            if geometry.covers(Point(longitude, latitude)):
                records.append({"provenance": provenance, "payload": properties.get("data", {}),
                                "source_kind": "approved_regional_dataset", "verification_status": provenance["verification_status"]})
        return records, "records_available" if records else "outside_approved_coverage"
    except (OSError, ValueError, KeyError, TypeError):
        return [], "invalid_source_or_provenance"
