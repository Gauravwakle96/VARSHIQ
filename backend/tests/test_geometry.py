"""Synthetic geometry is solely an automated scientific test fixture."""

import math

import pytest
from pyproj import Transformer

from app.services.geometry import assess_geometry, validate_geometry

_TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)
_FROM_UTM = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)
_X, _Y = _TO_UTM.transform(72.8777, 19.076)


def ring(size=100, offset_x=0, offset_y=0):
    points = [(0, 0), (size, 0), (size, size), (0, size), (0, 0)]
    return [list(_FROM_UTM.transform(_X + x + offset_x, _Y + y + offset_y)) for x, y in points]


def polygon():
    return {"type": "Polygon", "coordinates": [ring()]}


def test_wgs84_geodesic_area_agrees_with_projected_measured_square():
    result = assess_geometry(polygon())
    assert result["area_m2"] == pytest.approx(10_000, rel=0.003)
    assert result["crs"] == "EPSG:4326"
    assert result["measurement_status"] == "geospatial_estimate"
    assert 72.87 < result["centroid"]["longitude"] < 72.89
    assert 19.07 < result["centroid"]["latitude"] < 19.09


def test_hole_area_is_subtracted_regardless_of_winding():
    geometry = polygon()
    geometry["coordinates"].append(ring(20, 40, 40))
    result = assess_geometry(geometry)
    assert result["area_m2"] == pytest.approx(9600, rel=0.003)
    geometry["coordinates"] = [list(reversed(item)) for item in geometry["coordinates"]]
    assert assess_geometry(geometry)["area_m2"] == pytest.approx(result["area_m2"], abs=1e-5)


def test_disjoint_multipolygon_areas_are_added():
    geometry = {"type": "MultiPolygon", "coordinates": [[ring()], [ring(100, 200, 0)]]}
    assert assess_geometry(geometry)["area_m2"] == pytest.approx(20_000, rel=0.003)


def test_footprint_never_claims_catchment_verification():
    result = assess_geometry(polygon())
    assert "effective_catchment_m2" not in result
    assert any("not verified" in limitation for limitation in result["limitations"])


@pytest.mark.parametrize(
    "geometry",
    [
        {"type": "Point", "coordinates": [72, 19]},
        {"type": "Polygon", "coordinates": []},
        {"type": "Polygon", "coordinates": [[[72, 19], [73, 20], [73, 19], [72, 20], [72, 19]]]},
        {
            "type": "Polygon",
            "coordinates": [
                [[500_000, 2_000_000], [500_100, 2_000_000], [500_100, 2_000_100], [500_000, 2_000_000]]
            ],
        },
        {"type": "Polygon", "coordinates": [[[72, 91], [72.1, 91], [72.1, 91.1], [72, 91]]]},
        {"type": "Polygon", "coordinates": [[[72, 19], [72.1, 19], [72.1, 19.1]]]},
        {"type": "Polygon", "coordinates": [[[72, 19], [72.1, 19], [72.1, 19.1], [72, 19.1]]]},
        {"type": "Polygon", "coordinates": [[[72, 19], [math.nan, 19], [72.1, 19.1], [72, 19]]]},
        {"type": "Polygon", "coordinates": [[[72, 19], [True, 19], [72.1, 19.1], [72, 19]]]},
        {"type": "Polygon", "coordinates": [[[72, 19], [74, 19], [74, 21], [72, 19]]]},
    ],
)
def test_invalid_or_nonlocal_geometry_is_rejected(geometry):
    with pytest.raises(ValueError):
        validate_geometry(geometry)


def test_explicit_projected_crs_is_rejected_even_when_coordinates_look_valid():
    geometry = polygon()
    geometry["crs"] = {"type": "name", "properties": {"name": "EPSG:3857"}}
    with pytest.raises(ValueError):
        validate_geometry(geometry)


def test_valid_wgs84_crs_and_finite_altitude_are_accepted():
    geometry = polygon()
    geometry["crs"] = {"type": "name", "properties": {"name": "EPSG:4326"}}
    geometry["coordinates"] = [[coordinate + [10] for coordinate in geometry["coordinates"][0]]]
    assert assess_geometry(geometry)["area_m2"] == pytest.approx(10_000, rel=0.003)


def test_excessive_vertex_count_is_rejected():
    vertices = [
        [72.8 + 0.001 * math.cos(index * math.tau / 10_001), 19 + 0.001 * math.sin(index * math.tau / 10_001)]
        for index in range(10_001)
    ]
    vertices.append(vertices[0])
    with pytest.raises(ValueError, match="10,000"):
        validate_geometry({"type": "Polygon", "coordinates": [vertices]})
