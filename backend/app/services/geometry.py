"""Validated WGS84 building polygons and ellipsoidal footprint areas.

Footprint area is a geospatial estimate, never a verified harvesting catchment.
The centroid is a WGS84 planar geometry centroid for map centring; the area uses
the WGS84 ellipsoid and explicitly subtracts interior rings.
"""

from __future__ import annotations

import math
from typing import Any

from pyproj import Geod
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.validation import explain_validity

_GEOD = Geod(ellps="WGS84")
_MAX_VERTICES = 10_000


def _finite_coordinate(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    try:
        return math.isfinite(float(value))
    except (OverflowError, ValueError):
        return False


def validate_geometry(geometry: dict[str, Any]) -> Polygon | MultiPolygon:
    if not isinstance(geometry, dict) or geometry.get("type") not in {"Polygon", "MultiPolygon"}:
        raise ValueError("A GeoJSON Polygon or MultiPolygon is required")
    crs = geometry.get("crs")
    if crs is not None and crs != {"type": "name", "properties": {"name": "EPSG:4326"}}:
        raise ValueError("Geometry must use WGS84 longitude/latitude (EPSG:4326)")
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates:
        raise ValueError("Polygon coordinates cannot be empty")
    polygons = [coordinates] if geometry["type"] == "Polygon" else coordinates
    count = 0
    for polygon in polygons:
        if not isinstance(polygon, list) or not polygon:
            raise ValueError("Each polygon requires an exterior ring")
        for ring in polygon:
            if not isinstance(ring, list) or len(ring) < 4:
                raise ValueError("A polygon ring requires at least four coordinates including closure")
            for coordinate in ring:
                if not isinstance(coordinate, (list, tuple)) or len(coordinate) not in {2, 3}:
                    raise ValueError("Coordinates must contain longitude and latitude")
                if any(not _finite_coordinate(value) for value in coordinate):
                    raise ValueError("All coordinates must be finite numbers")
                if not -180 <= coordinate[0] <= 180 or not -90 <= coordinate[1] <= 90:
                    raise ValueError("Coordinates are outside WGS84 longitude/latitude bounds")
                count += 1
                if count > _MAX_VERTICES:
                    raise ValueError("Building geometry exceeds 10,000 vertices")
            if list(ring[0][:2]) != list(ring[-1][:2]):
                raise ValueError("Polygon rings must be explicitly closed")
    try:
        result = shape(geometry)
    except (TypeError, ValueError, IndexError) as exc:
        raise ValueError("Invalid GeoJSON polygon") from exc
    if result.is_empty or not result.is_valid:
        raise ValueError(f"Invalid polygon: {explain_validity(result)}")
    west, south, east, north = result.bounds
    if east - west > 1 or north - south > 1:
        raise ValueError(
            "A building footprint must be local (span no more than one degree); check coordinate order and CRS"
        )
    if result.area == 0:
        raise ValueError("Polygon area must be positive")
    return result


def _ring_area(ring: Any) -> float:
    coordinates = list(ring.coords)
    longitudes = [coordinate[0] for coordinate in coordinates]
    latitudes = [coordinate[1] for coordinate in coordinates]
    signed_area, _ = _GEOD.polygon_area_perimeter(longitudes, latitudes)
    return abs(signed_area)


def assess_geometry(geometry: dict[str, Any]) -> dict[str, Any]:
    validated = validate_geometry(geometry)
    polygons = list(validated.geoms) if isinstance(validated, MultiPolygon) else [validated]
    area = sum(
        _ring_area(polygon.exterior) - sum(_ring_area(ring) for ring in polygon.interiors)
        for polygon in polygons
    )
    if not math.isfinite(area) or area <= 0:
        raise ValueError("Ellipsoidal polygon area must be positive and finite")
    centroid = validated.centroid
    return {
        "area_m2": area,
        "centroid": {"latitude": centroid.y, "longitude": centroid.x},
        "crs": "EPSG:4326",
        "method": "WGS84 ellipsoidal geodesic area; polygon holes subtracted",
        "measurement_status": "geospatial_estimate",
        "limitations": [
            "Building footprint is not verified connected rooftop catchment area.",
            "Map centroid is a planar WGS84 centroid and may lie outside a concave footprint.",
        ],
    }
