from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select

from app.config import get_settings
from app.models import RainfallEvent, RainwaterCalculation, now
from app.security import utc
from app.serializers import property_data
from app.services.evidence import input_fingerprint
from app.services.hydrology import simulate
from app.services.rainfall.forecast_service import forecast


def modelling_inputs(prop):
    missing = []
    if prop.effective_catchment_m2 is None:
        missing.append("effective rooftop catchment measurement")
    if prop.runoff_coefficient is None or not prop.coefficient_source:
        missing.append("runoff coefficient with source/assumption")
    if missing:
        raise HTTPException(422, "Provide " + " and ".join(missing) + " before modelling")
    return {
        "area_m2": prop.effective_catchment_m2,
        "runoff_coefficient": prop.runoff_coefficient,
        "first_flush_mm": prop.first_flush_mm,
        "collection_efficiency": prop.collection_efficiency,
    }


def readiness(prop, calculation):
    actions = [
        "Inspect roof drains and clear obstructions before rain.",
        "Inspect filters and first-flush equipment.",
        "Record the current tank level to improve the starting estimate.",
    ]
    if calculation["overflow_l"] > 0:
        actions.append("Check the approved overflow route; this forecast suggests storage may fill.")
    return {
        "expected_inflow_l": calculation["net_inflow_l"],
        "available_capacity_l": max(0, calculation["capacity_l"] - prop.current_storage_l),
        "potential_overflow_l": calculation["overflow_l"],
        "actions": actions,
        "status": "forecast_preparation",
        "limitations": [
            "Preparation reminders do not prescribe unsafe tank discharge or certify water quality."
        ],
    }


async def run_twin(db, prop, days=7, capacity_l=None, daily_demand_l=None, persist=True):
    inputs = modelling_inputs(prop)
    weather = await forecast(db, prop.latitude, prop.longitude, prop.timezone, days, prop.id)
    # The current reading is treated as a starting estimate at the next full hour.
    # Elapsed calendar-day rainfall is never replayed onto that reading.
    instant = now()
    future_starts = [
        datetime.fromisoformat(row["time"]).astimezone(UTC)
        for row in weather["hourly"]
        if datetime.fromisoformat(row["time"]).astimezone(UTC) >= instant
    ]
    first_start = min(future_starts) if future_starts else instant + timedelta(days=30)
    future = [
        {**row, "precipitation_mm": row.get("liquid_rainfall_mm", row["precipitation_mm"])}
        for row in weather["hourly"]
        if datetime.fromisoformat(row["time"]).astimezone(UTC) >= first_start
    ]
    if not future:
        raise HTTPException(503, "Cached forecast no longer covers future intervals; refresh the forecast")
    capacity = prop.tank_capacity_l if capacity_l is None else capacity_l
    if capacity < prop.current_storage_l:
        raise HTTPException(
            422, "The tank size you try cannot be below the stored volume unless you explicitly account for water discharge"
        )
    calculation = simulate(
        future,
        **inputs,
        capacity_l=capacity,
        initial_storage_l=prop.current_storage_l,
        daily_demand_l=prop.daily_demand_l if daily_demand_l is None else daily_demand_l,
        reporting_timezone=prop.timezone,
        dry_gap_hours=get_settings().rain_event_dry_gap_hours,
    )
    assumptions = {
        **inputs,
        "roof_area_provenance": prop.roof_area_provenance,
        "input_basis": "planning_assumptions"
        if prop.measurement_status == "planning_assumptions"
        else "owner_entered",
        "coefficient_source": prop.coefficient_source,
        "roof_material": prop.roof_material,
        "starting_storage_l": prop.current_storage_l,
        "storage_reading_time": utc(prop.storage_measured_at).isoformat(),
        "storage_status": prop.storage_status,
        "tank_capacity_l": capacity,
        "daily_demand_l": prop.daily_demand_l if daily_demand_l is None else daily_demand_l,
        "measurement_status": prop.measurement_status,
        "simulation_start": future[0]["time"],
        "partial_hour_treatment": "Starts next full hour; partial current-hour rain/consumption omitted. Starting storage is carried as an estimate.",
        "dry_gap_hours": get_settings().rain_event_dry_gap_hours,
        "event_state": "Unknown antecedent diversion; initial wet event receives conservative first-flush assumption.",
        "demand_timing": "Uniform elapsed-time demand within each local civil day; rainfall captured before demand each hour.",
        "first_flush_basis": "rainfall-equivalent depth × connected catchment area × runoff coefficient, once per event",
        "water_use": "Demand must describe intended non-potable use unless treatment and safety are professionally established.",
    }
    confidence = {
        "measurement_status": prop.measurement_status,
        "forecast_source": weather["provider"],
        "forecast_time": weather["retrieved_at"],
        "spatial_resolution": weather["spatial_resolution"],
        "calculation_kind": "deterministic_forecast_estimate",
        "missing_information": [
            "Field evidence of antecedent first-flush state",
            "Verified collection efficiency",
            "Intraday demand schedule",
        ],
        "limitations": weather["limitations"] + calculation.get("limitations", []),
    }
    if prop.measurement_status != "field_verified":
        confidence["missing_information"].append("Field-verified connected catchment area")
    if prop.measurement_status == "planning_assumptions":
        confidence["calculation_kind"] = "forecast_with_planning_assumptions"
        confidence["missing_information"].extend(
            [
                "Measured tank capacity and starting storage",
                "Measured water demand",
                "Site-specific collection parameters",
            ]
        )
        confidence["limitations"].append(
            "Roof, collection, tank and demand inputs are illustrative planning assumptions, not field measurements."
        )
    if instant - utc(prop.storage_measured_at) > timedelta(hours=24):
        confidence["missing_information"].append(
            "A recent tank reading; entered storage is older than 24 hours"
        )
    payload = {
        "property_id": prop.id,
        "forecast": weather,
        "calculation": calculation,
        "assumptions": assumptions,
        "confidence": confidence,
        "readiness": readiness(prop, calculation),
        "scenario": not persist,
        "property_snapshot": property_data(prop),
        "input_fingerprint": input_fingerprint(prop),
    }
    if persist:
        existing = db.scalar(
            select(RainwaterCalculation)
            .where(
                RainwaterCalculation.property_id == prop.id, RainwaterCalculation.forecast_id == weather["id"]
            )
            .order_by(RainwaterCalculation.created_at.desc())
        )
        # Snapshots are immutable; repeated simulations never update measured storage or collection observations.
        if (
            existing
            and existing.payload.get("assumptions") == assumptions
            and existing.payload.get("input_fingerprint") == input_fingerprint(prop)
        ):
            return {**existing.payload, "id": existing.id}
        record = RainwaterCalculation(property_id=prop.id, forecast_id=weather["id"], payload=payload)
        db.add(record)
        db.flush()
        for event in calculation["events"]:
            db.add(
                RainfallEvent(
                    property_id=prop.id, forecast_id=weather["id"], calculation_id=record.id, payload=event
                )
            )
        db.commit()
        return {**payload, "id": record.id}
    return {**payload, "id": "scenario"}
