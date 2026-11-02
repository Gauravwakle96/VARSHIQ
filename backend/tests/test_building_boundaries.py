"""Bounded synthetic map/tile responses only; no downloaded production dataset."""
import asyncio
import gzip
import json
from datetime import timedelta

import httpx
import pytest
from fastapi import HTTPException
from test_providers import install_transport

from app.models import now
from app.services.buildings import building_footprint_service as buildings

POLYGON = {"type": "Polygon", "coordinates": [[[75.34, 19.87], [75.3401, 19.87], [75.3401, 19.8701], [75.34, 19.87]]]}


@pytest.fixture(autouse=True)
def clear_cache():
    buildings._cache.clear()
    yield
    buildings._cache.clear()


def test_overpass_lookup_validates_polygons_caches_and_expires(db_session, monkeypatch):
    calls = []
    coords = [{"lon": lon, "lat": lat} for lon, lat in POLYGON["coordinates"][0]]

    def handler(request):
        calls.append(request)
        assert request.method == "POST" and "building" in request.content.decode()
        return httpx.Response(200, json={"elements": [{"id": 1, "tags": {"building": "yes", "name": "AUTOMATED TEST"}, "geometry": coords},
                                                       {"id": 2, "geometry": coords[:-1]}]})

    install_transport(monkeypatch, handler)
    result = asyncio.run(buildings.lookup(db_session, 19.87, 75.34))
    assert len(result["features"]) == 1 and result["features"][0]["properties"]["measurement_status"] == "geospatial_estimate"
    assert asyncio.run(buildings.lookup(db_session, 19.87, 75.34))["cache"]
    assert len(calls) == 1
    buildings._cache[("osm", 19.87, 75.34)]["retrieved_at"] = (now() - timedelta(days=2)).isoformat()
    asyncio.run(buildings.lookup(db_session, 19.87, 75.34))
    assert len(calls) == 2


def test_overpass_outage_uses_bounded_official_map_xml(db_session, monkeypatch):
    xml = b'<osm><node id="1" lat="19.87" lon="75.34"/><node id="2" lat="19.87" lon="75.3401"/>' \
          b'<node id="3" lat="19.8701" lon="75.3401"/><way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/>' \
          b'<tag k="building" v="yes"/></way><way id="11"><nd ref="1"/></way></osm>'

    def handler(request):
        if request.method == "POST":
            return httpx.Response(503)
        assert request.url.host == "api.openstreetmap.org"
        assert "bbox" in request.url.params
        return httpx.Response(200, content=xml)

    install_transport(monkeypatch, handler)
    result = asyncio.run(buildings.lookup(db_session, 19.87, 75.34))
    assert result["features"][0]["id"] == "10"


def test_untrusted_xml_entities_become_provider_error(db_session, monkeypatch):
    install_transport(monkeypatch, lambda request: httpx.Response(503) if request.method == "POST" else
                      httpx.Response(200, content=b'<!DOCTYPE osm [<!ENTITY x "unsafe">]><osm>&x;</osm>'))
    with pytest.raises(HTTPException) as failure:
        asyncio.run(buildings.lookup(db_session, 19.87, 75.34))
    assert failure.value.status_code == 502


@pytest.mark.parametrize("lat,lon,provider,status", [(100, 75, "osm", 422), (19, 75, "gobs", 422), (19, 75, "microsoft", 503)])
def test_unavailable_or_invalid_building_adapter_is_explicit(db_session, lat, lon, provider, status):
    with pytest.raises(HTTPException) as failure:
        asyncio.run(buildings.lookup(db_session, lat, lon, provider))
    assert failure.value.status_code == status


def microsoft_transport(monkeypatch, data, tile_url="https://bfppub.blob.core.windows.net/test.jsonl.gz"):
    key = buildings.quadkey(19.87, 75.34)
    index = f"QuadKey,Url\n{key},{tile_url}\n"
    calls = []

    def handler(request):
        calls.append(request)
        if "dataset-links.csv" in request.url.path:
            return httpx.Response(200, text=index)
        return httpx.Response(200, content=gzip.compress(data))

    install_transport(monkeypatch, handler)
    monkeypatch.setattr(buildings.settings, "microsoft_enabled", True)
    return calls


def test_microsoft_only_extracts_local_polygons_and_preserves_missing_attributes(db_session, monkeypatch):
    feature = {"type": "Feature", "geometry": POLYGON, "properties": {"height": -1, "confidence": -1}}
    distant = {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[[20, 20], [20.1, 20], [20.1, 20.1], [20, 20]]]}, "properties": {}}
    calls = microsoft_transport(monkeypatch, (json.dumps(feature) + "\n" + json.dumps(distant) + "\n").encode())
    result = asyncio.run(buildings.lookup(db_session, 19.87, 75.34, "microsoft"))
    assert len(calls) == 2 and len(result["features"]) == 1
    props = result["features"][0]["properties"]
    assert props["height_m"] is None and props["detection_confidence"] is None
    assert props["source"] == "microsoft"


def test_microsoft_rejects_unapproved_tile_host(db_session, monkeypatch):
    calls = microsoft_transport(monkeypatch, b'{}\n', "https://unapproved.example.com/tile.gz")
    with pytest.raises(HTTPException) as failure:
        asyncio.run(buildings.lookup(db_session, 19.87, 75.34, "microsoft"))
    assert failure.value.status_code == 502 and len(calls) == 1


def test_microsoft_stream_and_line_size_budgets_are_enforced(db_session, monkeypatch):
    microsoft_transport(monkeypatch, b'x' * 2_000_002)
    with pytest.raises(HTTPException) as failure:
        asyncio.run(buildings.lookup(db_session, 19.87, 75.34, "microsoft"))
    assert failure.value.status_code == 502
    monkeypatch.setattr(buildings.settings, "microsoft_tile_max_bytes", 1)
    with pytest.raises(HTTPException) as failure:
        asyncio.run(buildings.lookup(db_session, 19.87, 75.34, "microsoft"))
    assert failure.value.status_code == 502
