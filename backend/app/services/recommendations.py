from sqlalchemy import select

from app.models import Recommendation


def generate(db, prop):
    items = []
    missing = []
    if prop.effective_catchment_m2 is None:
        missing.append("Connected catchment measurement")
    if prop.runoff_coefficient is None:
        missing.append("Documented runoff coefficient")
    if prop.measurement_status != "field_verified":
        missing.append("Field verification")
    items.append(
        {
            "type": "storage_tank" if prop.tank_capacity_l else "rain_barrel",
            "title": "Evaluate rooftop storage for intended non-potable demand",
            "reason": "A storage system can connect measured roof runoff to the property's documented demand; size it using historical simulation.",
            "status": "preliminary" if missing else "screening_complete",
            "assumptions": [
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
        ],
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
