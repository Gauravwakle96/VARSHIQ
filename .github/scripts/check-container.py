"""Isolated CI Compose smoke test; never run against a real deployment database."""
import json
import os
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar


BASE_URL = os.environ.get("VARSHIQ_TEST_URL", "http://127.0.0.1:8080")


class TestClient:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        self.csrf = ""

    def request(self, path, method="GET", body=None, expected=200, csrf=True):
        headers = {}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if method != "GET" and csrf:
            headers["X-CSRF-Token"] = self.csrf
        request = urllib.request.Request(
            BASE_URL + path, method=method, headers=headers,
            data=json.dumps(body).encode() if body is not None else None,
        )
        try:
            response = self.opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            payload = json.loads(response.read())
            if response.status != expected:
                raise AssertionError(f"{method} {path} returned {response.status}; expected {expected}")
        return payload.get("data", payload)

    def register(self, suffix):
        self.csrf = self.request("/api/v1/auth/session")["csrf_token"]
        session = self.request("/api/v1/auth/register", "POST", {
            "name": "AUTOMATED TEST Container Owner",
            "email": f"container-test-{suffix}-{time.time_ns()}@example.com",
            "password": "isolated-CI-synthetic-password-2026",
        })
        self.csrf = session["csrf_token"]


def main():
    with urllib.request.urlopen(BASE_URL, timeout=20) as response:
        assert response.status == 200 and b"VARSHIQ" in response.read()
    owner = TestClient()
    health = owner.request("/api/v1/health")
    assert health["database"] == "postgresql", "Compose acceptance requires PostgreSQL"
    owner.request("/api/v1/buildings", expected=401)
    owner.register("one")
    prop = owner.request("/api/v1/buildings", "POST", {
        "name": "AUTOMATED TEST Container Building",
        "property_type": "apartment", "locality": "AUTOMATED TEST region",
        "latitude": 19.8762, "longitude": 75.3433,
        "geometry": {"type": "Polygon", "coordinates": [[
            [75.3432, 19.8761], [75.3434, 19.8761], [75.3434, 19.8763],
            [75.3432, 19.8763], [75.3432, 19.8761],
        ]]},
        "geometry_source": "manual_polygon",
        "effective_catchment_m2": 100, "runoff_coefficient": 0.8,
        "coefficient_source": "AUTOMATED TEST assumption",
        "first_flush_mm": 1, "collection_efficiency": 0.9,
        "tank_capacity_l": 1000, "current_storage_l": 200, "daily_demand_l": 100,
    }, expected=201)
    assert prop["measurement_status"] == "user_entered" and prop["footprint_area_m2"] > 0
    assert owner.request(f"/api/v1/buildings/{prop['id']}")["id"] == prop["id"]
    owner.request(f"/api/v1/buildings/{prop['id']}", "PATCH", {"daily_demand_l": 150}, expected=403, csrf=False)
    result = owner.request("/api/v1/rainwater/calculate", "POST", {
        "area_m2": 100, "rainfall_mm": 10, "runoff_coefficient": 0.8,
        "first_flush_mm": 1, "collection_efficiency": 0.9,
    })
    assert abs(result["net_inflow_l"] - 648) < 1e-6
    outsider = TestClient()
    outsider.register("two")
    outsider.request(f"/api/v1/buildings/{prop['id']}", expected=404)
    assert outsider.request("/api/v1/dashboard/locality")["registered_count"] == 0
    print("Verified Compose: frontend, PostgreSQL API, geometry registration, CSRF, private access and runoff")


if __name__ == "__main__":
    main()
