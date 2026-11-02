from sqlalchemy import select

from app.models import Recommendation


def generate(db, prop):
    items = []
    missing = []
    planning = prop.measurement_status == "planning_assumptions"
    if prop.effective_catchment_m2 is None:
        missing.append("Connected catchment measurement")
    if prop.runoff_coefficient is None:
        missing.append("Documented runoff coefficient")
    if prop.measurement_status != "field_verified":
        missing.append("Field verification")
    if planning:
        missing.extend(
            ["Measured tank capacity", "Measured water demand", "Site-specific collection parameters"]
        )
    items.append(
        {
            "type": "storage_tank" if prop.tank_capacity_l else "rain_barrel",
            "title": "Evaluate rooftop storage for intended non-potable demand",
            "reason": "Compare rooftop storage against the property's intended non-potable demand using historical simulation and verified site inputs.",
            "status": "preliminary" if missing else "screening_complete",
            "assumptions": [
                "Input basis: illustrative planning assumptions"
                if planning
                else "Input basis: owner-entered information",
                f"Entered storage capacity: {prop.tank_capacity_l:g} L",
                f"Entered demand: {prop.daily_demand_l:g} L/day",
            ],
            "missing_information": missing
            + [
                "Installation space and structural assessment",
                "Water treatment and intended-use requirements",
            ],
        }
    )
    for kind, title in (
        ("recharge_pit", "Recharge pit"),
        ("recharge_well", "Recharge well"),
        ("recharge_trench", "Recharge trench"),
        ("percolation", "Percolation system"),
    ):
        items.append(
            {
                "type": kind,
                "title": title + " requires professional field assessment",
                "reason": "No verified site soil infiltration, groundwater quality/depth, aquifer conditions or local permissions are established by this platform.",
                "status": "professional_assessment_required",
                "assumptions": [],
                "missing_information": [
                    "Field infiltration test",
                    "Groundwater quality and depth",
                    "Hydrogeology",
                    "Contamination and foundation setbacks",
                    "Available space",
                    "Applicable local restrictions",
                ],
            }
        )
    payload = {
        "property_id": prop.id,
        "input_basis": "planning_assumptions" if planning else "owner_entered",
        "items": items,
        "readiness": {
            "actions": [
                "Measure connected catchment",
                "Inspect drains and filters",
                "Record current storage",
                "Compare capacities with historical demand",
            ]
        },
        "limitations": [
            "Recommendations are preliminary engineering screening, not certified recharge or structural designs.",
            "No aquifer suitability is inferred from satellite images.",
            "Cost estimates require user-supplied assumptions or actual quotations.",
        ]
        + (
            ["Roof, collection, tank and demand inputs are planning assumptions, not field measurements."]
            if planning
            else []
        ),
    }
    record = Recommendation(property_id=prop.id, payload=payload)
    db.add(record)
    db.commit()
    return {**payload, "id": record.id}


def latest_recommendation(db, property_id):
    record = db.scalar(
        select(Recommendation)
        .where(Recommendation.property_id == property_id)
        .order_by(Recommendation.created_at.desc())
    )
    return {**record.payload, "id": record.id} if record else None
