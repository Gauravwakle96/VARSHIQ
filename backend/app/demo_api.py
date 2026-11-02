"""Anonymous, bounded and stateless demonstration boundary."""

from typing import Literal

from fastapi import APIRouter, Query
from pydantic import Field, model_validator

from app.schemas import Schema
from app.serializers import ok
from app.services.buildings.building_footprint_service import lookup
from app.services.demo import demonstration
from app.services.geometry import assess_geometry

router = APIRouter(prefix="/api/v1/demo", tags=["Illustrative demo"])


class DemoInputs(Schema):
    profile: Literal["home", "office", "society"] = "home"
    weather: Literal["bursts", "steady", "dry"] = "bursts"
    rainfall_mm: float = Field(default=36, ge=0, le=120)
    area_m2: float = Field(default=120, ge=10, le=5000)
    runoff_coefficient: float = Field(default=0.8, ge=0, le=1)
    first_flush_mm: float = Field(default=1, ge=0, le=5)
    collection_efficiency: float = Field(default=0.9, ge=0, le=1)
    capacity_l: float = Field(default=1200, ge=100, le=50000)
    initial_storage_pct: float = Field(default=25, ge=0, le=100)
    daily_demand_l: float = Field(default=400, ge=0, le=30000)
    budget_inr: float = Field(default=60000, ge=0, le=200000)

    @model_validator(mode="after")
    def dry_scenario(self):
        if self.weather == "dry" and self.rainfall_mm != 0:
            raise ValueError("A dry scenario requires zero rainfall")
        return self


@router.post("/simulate")
def simulate_demo(body: DemoInputs):
    # No authentication/CSRF required: no reads/writes of private state,
    # cookie changes, external calls or user-supplied arbitrary time series.
    return ok(demonstration(body))


@router.get("/footprints")
async def real_demo_buildings(
    latitude: float = Query(ge=-85, le=85, allow_inf_nan=False),
    longitude: float = Query(ge=-180, le=180, allow_inf_nan=False),
):
    # Public geography only, bounded provider/cache; no private registrations
    # or source-status writes. Water inputs are never inferred as verified.
    result = await lookup(None, latitude, longitude, "osm")
    features = []
    for feature in result["features"]:
        try:
            assessment = assess_geometry(feature["geometry"])
        except ValueError:
            continue
        features.append(
            {
                **feature,
                "properties": {
                    **feature["properties"],
                    "footprint_area_m2": assessment["area_m2"],
                    "centroid": assessment["centroid"],
                },
            }
        )
    return ok(
        {
            **result,
            "features": features,
            "data_kind": "real_public_geography",
            "water_inputs": "simulated_unverified",
            "persisted": False,
        }
    )
