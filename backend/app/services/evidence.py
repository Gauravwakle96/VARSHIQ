import hashlib
import json
from datetime import datetime

from app.config import get_settings
from app.models import now
from app.security import utc


def roof_parameters(prop):
    return {
        "area_m2": prop.effective_catchment_m2,
        "runoff_coefficient": prop.runoff_coefficient,
        "coefficient_source": prop.coefficient_source,
        "measurement_status": prop.measurement_status,
        "parameters_updated_at": utc(prop.parameters_updated_at).isoformat(),
    }


def input_fingerprint(prop):
    data = {
        **roof_parameters(prop),
        "latitude": prop.latitude,
        "longitude": prop.longitude,
        "timezone": prop.timezone,
        "geometry": prop.geometry,
        "first_flush_mm": prop.first_flush_mm,
        "collection_efficiency": prop.collection_efficiency,
        "tank_capacity_l": prop.tank_capacity_l,
        "current_storage_l": prop.current_storage_l,
        "daily_demand_l": prop.daily_demand_l,
        "storage_measured_at": utc(prop.storage_measured_at).isoformat(),
        "storage_status": prop.storage_status,
    }
    return hashlib.sha256(json.dumps(data, sort_keys=True, allow_nan=False).encode()).hexdigest()


def snapshot_status(prop, payload):
    """Current presentation flags never mutate an immutable prediction snapshot."""
    changed = payload.get("input_fingerprint") != input_fingerprint(prop)
    reasons = ["Property inputs or measurements changed after this prediction"] if changed else []
    weather = payload.get("forecast", {})
    timestamp = weather.get("retrieved_at")
    if weather.get("stale"):
        reasons.append("The provider forecast was already stale at simulation time")
    if timestamp:
        age = (now() - utc(datetime.fromisoformat(timestamp))).total_seconds()
        if age < 0 or age > get_settings().forecast_cache_minutes * 60:
            reasons.append("Forecast retrieval is outside the configured freshness window")
    else:
        reasons.append("Forecast retrieval timestamp is unavailable")
    return {"stale": bool(reasons), "stale_reasons": reasons, "inputs_changed": changed,
            "horizon_days": len(weather.get("daily", [])),
            "snapshot_retrieved_at": timestamp}
