"""Property operations, measurement evidence and budget-constrained planning."""
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session

from app import operations_schemas as inputs
from app.analytics import calibration_data
from app.api import audit, forecast_water, storage
from app.config import get_settings
from app.database import get_db
from app.models import (
    GroundwaterData,
    MaintenanceRecord,
    Property,
    RainwaterCalculation,
    SoilData,
    WaterConsumption,
    WaterQualityRecord,
    WaterSource,
    now,
)
from app.security import authorised_property, check_csrf, require_user, utc
from app.serializers import ok, row_data
from app.services.community import select_investments
from app.services.environment import approved_records
from app.services.evidence import input_fingerprint
from app.services.hydrology import optimise
from app.services.rainfall.historical_service import historical
from app.services.watertwin import modelling_inputs

router = APIRouter(prefix="/api/v1")
router.add_api_route("/watertwin/{property_id}", storage, methods=["GET"])
router.add_api_route("/watertwin/simulate", forecast_water, methods=["POST"], dependencies=[Depends(check_csrf)])


def save_record(db, user, body, model, action):
    prop = authorised_property(db, body.property_id, user)
    if isinstance(body, inputs.VolumeRecord):
        # Check and insert under the same writer transaction to prevent two
        # concurrent submissions counting the same meter interval twice.
        if db.get_bind().dialect.name == "postgresql":
            db.execute(select(Property.id).where(Property.id == prop.id).with_for_update()).scalar_one()
        elif db.get_bind().dialect.name == "sqlite":
            if not db.connection().connection.driver_connection.in_transaction:
                db.execute(text("BEGIN IMMEDIATE"))
        category = "source_type" if model is WaterSource else "use_type"
        overlap_query = select(model).where(
            model.property_id == prop.id,
            getattr(model, category) == getattr(body, category),
            model.interval_start < body.interval_end,
            model.interval_end > body.interval_start,
        )
        if model is WaterConsumption and body.source_type is not None:
            overlap_query = overlap_query.where(or_(model.source_type == body.source_type, model.source_type.is_(None)))
        overlapping = db.scalar(overlap_query)
        if overlapping:
            raise HTTPException(409, "An overlapping record for this source/use already exists; avoid counting water twice")
    record = model(user_id=user.id, **body.model_dump())
    db.add(record)
    audit(db, user, action, prop.id)
    db.commit()
    return ok(row_data(record), data_kind="user_recorded_measurement")


@router.post("/water-sources/records", dependencies=[Depends(check_csrf)], status_code=201)
def add_source(body: inputs.SourceRecord, db: Session = Depends(get_db), user=Depends(require_user)):
    return save_record(db, user, body, WaterSource, "water_source.record")


@router.post("/consumption/records", dependencies=[Depends(check_csrf)], status_code=201)
def add_consumption(body: inputs.ConsumptionRecord, db: Session = Depends(get_db), user=Depends(require_user)):
    return save_record(db, user, body, WaterConsumption, "consumption.record")


@router.get("/water-sources/{property_id}")
def water_sources(property_id: str, days: int = Query(30, ge=1, le=3660),
                  db: Session = Depends(get_db), user=Depends(require_user)):
    prop = authorised_property(db, property_id, user)
    end = now()
    start = end - timedelta(days=days)
    sources, consumption = [], []
    excluded = 0
    for model, records in ((WaterSource, sources), (WaterConsumption, consumption)):
        candidates = db.scalars(select(model).where(model.property_id == prop.id, model.interval_end > start)
                               .order_by(model.interval_end.desc()))
        for record in candidates:
            if utc(record.interval_start) >= start and utc(record.interval_end) <= end:
                records.append(row_data(record))
            else:
                excluded += 1
    by_source, by_use = defaultdict(float), defaultdict(float)
    for row in sources:
        by_source[row["source_type"]] += row["volume_l"]
    for row in consumption:
        by_use[row["use_type"]] += row["volume_l"]
    return ok({
        "sources": sources, "consumption": consumption,
        "totals": {"supply_l": sum(by_source.values()), "consumption_l": sum(by_use.values())},
        "by_source": dict(by_source), "by_use": dict(by_use),
        "period_start": start.isoformat(), "period_end": end.isoformat(),
        "boundary_records_excluded": excluded,
        "limitations": [
            "Only user-recorded intervals wholly inside the selected period are summed; partial intervals are excluded without proration.",
            "Estimated and measured records retain their reliability label; gaps in recording are missing water information, not zero supply.",
            "Supply and consumption do not establish a complete mass balance without matching tank changes, transfers, leakage and overflow.",
            "Consumption records do not automatically change the manually configured WaterTwin daily demand.",
            "Known-distinct source slices may share a use interval; an unspecified-source use total cannot overlap either slice.",
        ],
    })


@router.post("/maintenance/records", dependencies=[Depends(check_csrf)], status_code=201)
def add_maintenance(body: inputs.Maintenance, db: Session = Depends(get_db), user=Depends(require_user)):
    return save_record(db, user, body, MaintenanceRecord, "maintenance.record")


@router.get("/maintenance/{property_id}")
def maintenance(property_id: str, db: Session = Depends(get_db), user=Depends(require_user)):
    prop = authorised_property(db, property_id, user)
    rows = list(db.scalars(select(MaintenanceRecord).where(MaintenanceRecord.property_id == prop.id)
                           .order_by(MaintenanceRecord.performed_at.desc())))
    latest = {}
    for record in rows:
        latest.setdefault(record.task, record)
    checks, alerts = [], []
    for task in inputs.Task.__args__:
        record = latest.get(task)
        overdue = bool(record and record.next_due_at and utc(record.next_due_at) <= now())
        status = ("needs_attention" if record and record.condition == "needs_attention" else
                  "overdue" if overdue else "unknown" if record is None or record.condition == "unknown" else
                  "recorded_good")
        checks.append({"task": task, "title": task.replace("_", " ").capitalize(), "status": status,
                       "last_performed_at": utc(record.performed_at).isoformat() if record else None,
                       "next_due_at": utc(record.next_due_at).isoformat() if record and record.next_due_at else None})
        if status in {"needs_attention", "overdue"}:
            alerts.append({"code": task, "title": task.replace("_", " ").capitalize(), "status": status,
                           "message": "Review the owner-recorded inspection and arrange maintenance."})
    pairs = calibration_data(db, prop)["pairs"]
    if len(pairs) >= 3 and prop.collection_efficiency > 0:
        recent = pairs[-3:]
        if all(row["efficiency"] < 0.8 * prop.collection_efficiency for row in recent):
            alerts.append({"code": "collection_underperformance", "title": "Repeated collection underperformance",
                           "status": "inspection_suggested",
                           "message": "Three reliable intervals are below 80% of configured efficiency. Inspect drains, filters and measurement methods; the cause is unconfirmed.",
                           "threshold_fraction": 0.8, "nonoverlapping_intervals": len(recent),
                           "intervals": [{key: row[key] for key in ("interval_start", "interval_end", "observation_ids")} for row in recent]})
    calculation = db.scalar(select(RainwaterCalculation).where(RainwaterCalculation.property_id == prop.id)
                            .order_by(RainwaterCalculation.created_at.desc()))
    prediction = None
    if calculation and calculation.payload.get("input_fingerprint") == input_fingerprint(prop):
        weather = calculation.payload.get("forecast", {})
        if not weather.get("stale") and weather.get("retrieved_at"):
            from datetime import datetime

            age = (now() - utc(datetime.fromisoformat(weather["retrieved_at"]))).total_seconds()
            if 0 <= age <= get_settings().forecast_cache_minutes * 60:
                prediction = calculation.payload.get("readiness")
    return ok({"records": [row_data(row) for row in rows], "alerts": alerts,
               "readiness": {"checks": checks, "forecast": prediction, "available_capacity_l":
                             max(0, prop.tank_capacity_l - prop.current_storage_l),
                             "storage_status": prop.storage_status,
                             "limitations": [
                                 "Good means the condition reported at the inspection time; no universal maintenance schedule is invented.",
                                 "Forecast preparation requires a fresh WaterTwin run with current inputs; no forecast is inferred when unavailable.",
                                 "The 80% / three-interval inspection rule is a disclosed screening heuristic, not a diagnosed fault or trained ML model.",
                             ]}})


QUALITY_LIMITATIONS = [
    "Records are user-entered test results with method, date and laboratory provenance.",
    "pH, TDS and turbidity alone cannot certify drinking-water safety; microbiological and other applicable tests and professional assessment are required.",
    "Rainwater intended for toilets, cleaning or gardening still needs suitable treatment and intended-use assessment.",
]


@router.post("/water-quality/records", dependencies=[Depends(check_csrf)], status_code=201)
def add_quality(body: inputs.Quality, db: Session = Depends(get_db), user=Depends(require_user)):
    return save_record(db, user, body, WaterQualityRecord, "water_quality.record")


@router.get("/water-quality/{property_id}")
def quality(property_id: str, db: Session = Depends(get_db), user=Depends(require_user)):
    prop = authorised_property(db, property_id, user)
    records = db.scalars(select(WaterQualityRecord).where(WaterQualityRecord.property_id == prop.id)
                        .order_by(WaterQualityRecord.tested_at.desc()))
    return ok({"records": [row_data(row) for row in records], "limitations": QUALITY_LIMITATIONS})


@router.get("/groundwater/{property_id}")
def groundwater(property_id: str, db: Session = Depends(get_db), user=Depends(require_user)):
    prop = authorised_property(db, property_id, user)
    water = [row_data(row) for row in db.scalars(select(GroundwaterData).where(GroundwaterData.property_id == prop.id))]
    soil = [row_data(row) for row in db.scalars(select(SoilData).where(SoilData.property_id == prop.id))]
    regional_water, water_status = approved_records(prop.latitude, prop.longitude, "groundwater")
    regional_soil, soil_status = approved_records(prop.latitude, prop.longitude, "soil")
    water.extend(regional_water)
    soil.extend(regional_soil)
    return ok({"groundwater": water, "soil": soil, "status": "records_available" if water or soil else "unavailable",
               "coverage_status": {"groundwater": water_status, "soil": soil_status},
               "limitations": ["No groundwater/soil records are generated from satellite geometry.",
                                "Regional records do not verify a site's infiltration or aquifer suitability; recharge needs professional field assessment."]})


@router.post("/community/optimise", dependencies=[Depends(check_csrf)])
async def community_budget(body: inputs.CommunityBudget, db: Session = Depends(get_db), user=Depends(require_user)):
    properties = {option.property_id: authorised_property(db, option.property_id, user) for option in body.options}
    alternatives, excluded, evidence = [], [], []
    for property_id, prop in properties.items():
        quotes = [option for option in body.options if option.property_id == property_id]
        if prop.measurement_status != "field_verified":
            excluded.append({"property_id": property_id, "reason": "Field-verified catchment is required for investment comparison"})
            continue
        valid = []
        for quote in quotes:
            if not quote.installation_space_confirmed or quote.capacity_l <= prop.tank_capacity_l:
                excluded.append({"property_id": property_id, "capacity_l": quote.capacity_l,
                                 "reason": "Confirm installation space and compare an upgrade larger than the existing tank"})
            else:
                valid.append(quote)
        if not valid:
            continue
        roof = modelling_inputs(prop)
        try:
            data = await historical(db, prop.latitude, prop.longitude, prop.timezone,
                                    body.start_date, body.end_date, body.provider)
        except HTTPException as exc:
            if exc.status_code not in {502, 503}:
                raise
            excluded.append({"property_id": property_id, "reason": exc.detail})
            continue
        simulation = optimise(data["daily"], [prop.tank_capacity_l, *[q.capacity_l for q in valid]],
                              **roof, daily_demand_l=prop.daily_demand_l, initial_storage_l=0)
        comparisons = {row["capacity_l"]: row["simulation"] for row in simulation["comparisons"]}
        baseline = comparisons[prop.tank_capacity_l]
        for quote in valid:
            result = comparisons[quote.capacity_l]
            benefit = max(0, result["water_supplied_l"] - baseline["water_supplied_l"])
            alternatives.append({**quote.model_dump(), "property_name": prop.name,
                                 "period_benefit_l": benefit,
                                 "annualised_benefit_l": benefit * 365.2425 / data["coverage"]["days"],
                                 "baseline_supplied_l": baseline["water_supplied_l"],
                                 "upgrade_supplied_l": result["water_supplied_l"],
                                 "avoided_overflow_l": baseline["overflow_l"] - result["overflow_l"],
                                 "reason": "Additional simulated water supplied under the same rainfall, losses and demand; quoted installed cost and space confirmation supplied by the owner"})
        evidence.append({"property_id": property_id, "latitude": prop.latitude, "longitude": prop.longitude,
                         "historical": {key: data[key] for key in ("provider", "data_kind", "retrieved_at", "coverage", "spatial_resolution", "attribution")},
                         "roof_assumptions": roof, "daily_demand_l": prop.daily_demand_l})
    result = select_investments(alternatives, body.budget_inr)
    audit(db, user, "community.optimise", details={"candidate_properties": len(properties), "selected": len(result["selected"])})
    db.commit()
    return ok({**result, "annualised_benefit_l": sum(option["annualised_benefit_l"] for option in result["selected"]),
               "alternatives": alternatives, "excluded": excluded, "evidence": evidence,
               "assumptions": [
                   "Maximises additional supplied water within the quoted budget; at most one replacement storage upgrade per property.",
                   "Daily history approximates one first flush per wet day, capture before daily demand, empty initial storage and constant configured demand.",
                   "Annualised benefit scales this selected period; it is not an annual forecast or guaranteed saving.",
                   "User-entered quotations and installation confirmation are not structural certification; installation/treatment/operating costs must be checked.",
                   "Independent storage upgrades only; interbuilding pipe networks, shared-tank hydraulics and recharge are outside this solver.",
               ]})
