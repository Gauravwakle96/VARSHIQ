import secrets
from datetime import date
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import schemas
from app.config import ROOT, get_settings
from app.database import engine, get_db
from app.models import (
    AuditLog,
    AuthSession,
    BuildingFootprint,
    Organisation,
    Property,
    PropertyPhoto,
    RainfallObservation,
    RainwaterCalculation,
    RoofMeasurement,
    User,
    WaterDemand,
    WaterTank,
    now,
)
from app.security import (
    SESSION_COOKIE,
    authorised_property,
    check_csrf,
    create_session,
    csrf_token,
    digest,
    hasher,
    optional_user,
    password_matches,
    require_user,
    set_csrf,
)
from app.serializers import ok, property_data, row_data, user_data
from app.services.buildings.building_footprint_service import lookup
from app.services.evidence import snapshot_status
from app.services.geometry import assess_geometry
from app.services.hydrology import calculate, optimise
from app.services.photo_storage import read_photo, save_photo
from app.services.rainfall.forecast_service import forecast
from app.services.rainfall.historical_service import historical
from app.services.rainfall.imd_service import official_product
from app.services.recommendations import generate, latest_recommendation
from app.services.watertwin import modelling_inputs, run_twin

router = APIRouter(prefix="/api/v1")
settings = get_settings()


def audit(db, user, action, resource_id=None, details=None):
    db.add(
        AuditLog(
            user_id=user.id if user else None, action=action, resource_id=resource_id, details=details or {}
        )
    )


@router.get("/auth/session")
def session(request: Request, response: Response, user=Depends(optional_user)):
    token = csrf_token()
    set_csrf(response, token)
    return ok({"user": user_data(user) if user else None, "csrf_token": token})


@router.post("/auth/register", dependencies=[Depends(check_csrf)])
def register(body: schemas.Register, response: Response, db: Session = Depends(get_db)):
    email = str(body.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Account registration unavailable for this email; try signing in")
    org = Organisation(name=f"{body.name}'s workspace")
    db.add(org)
    db.flush()
    user = User(
        name=body.name,
        email=email,
        password_hash=hasher.hash(body.password),
        organisation_id=org.id,
        role="owner",
    )
    db.add(user)
    try:
        db.flush()
        audit(db, user, "account.register")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Account registration unavailable; try signing in") from exc
    token = create_session(db, user, response)
    return ok({"user": user_data(user), "csrf_token": token})


@router.post("/auth/login", dependencies=[Depends(check_csrf)])
def login(body: schemas.Login, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == str(body.email).lower()))
    # Verify a dummy hash for absent accounts to reduce timing-based email enumeration.
    hashed = user.password_hash if user else hasher.hash("not-a-real-user-password")
    if not password_matches(body.password, hashed) or user is None:
        raise HTTPException(401, "Email or password is incorrect")
    audit(db, user, "account.login")
    token = create_session(db, user, response)
    return ok({"user": user_data(user), "csrf_token": token})


@router.post("/auth/logout", dependencies=[Depends(check_csrf)])
def logout(request: Request, response: Response, db: Session = Depends(get_db), user=Depends(optional_user)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        record = db.scalar(select(AuthSession).where(AuthSession.token_hash == digest(token)))
        if record:
            db.delete(record)
    audit(db, user, "account.logout")
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return ok({"signed_out": True})


@router.get("/buildings")
def buildings(db: Session = Depends(get_db), user=Depends(require_user)):
    query = (
        select(Property).where(Property.organisation_id == user.organisation_id).order_by(Property.created_at)
    )
    return ok([property_data(prop) for prop in db.scalars(query)])


@router.post("/buildings/geometry", dependencies=[Depends(check_csrf)])
def geometry(body: schemas.GeometryRequest, user=Depends(require_user)):
    return ok(assess_geometry(body.geometry))


@router.get("/buildings/lookup")
async def building_lookup(
    latitude: float = Query(ge=-85, le=85),
    longitude: float = Query(ge=-180, le=180),
    provider: str = "osm",
    db: Session = Depends(get_db),
    user=Depends(require_user),
):
    return ok(await lookup(db, latitude, longitude, provider))


def apply_footprint(db, prop):
    if prop.geometry is None:
        prop.footprint_area_m2 = None
        return
    assessment = assess_geometry(prop.geometry)
    prop.footprint_area_m2 = assessment["area_m2"]
    footprint = BuildingFootprint(
        property_id=prop.id,
        source=prop.geometry_source,
        source_id=prop.geometry_source_id,
        source_uri=prop.geometry_source_uri,
        area_m2=assessment["area_m2"],
        geometry_json=prop.geometry,
        provenance={
            "method": assessment["method"],
            "measurement_status": "geospatial_estimate",
            "crs": "EPSG:4326",
            "recorded_by": prop.owner_id,
        },
    )
    if engine.dialect.name == "postgresql":
        from geoalchemy2.shape import from_shape
        from shapely.geometry import MultiPolygon, shape

        polygon = shape(prop.geometry)
        footprint.spatial_geometry = from_shape(
            MultiPolygon([polygon]) if polygon.geom_type == "Polygon" else polygon, srid=4326
        )
    else:
        footprint.spatial_geometry = prop.geometry
    db.add(footprint)


def consistent_geometry(data):
    if data.geometry is None:
        return
    from pyproj import Geod
    from shapely.geometry import Point, shape
    from shapely.ops import nearest_points

    polygon = shape(data.geometry)
    point = Point(data.longitude, data.latitude)
    nearest = nearest_points(polygon, point)[0]
    _, _, distance = Geod(ellps="WGS84").inv(data.longitude, data.latitude, nearest.x, nearest.y)
    if abs(distance) > 100:
        raise HTTPException(
            422,
            "Property coordinates must be within 100 metres of the selected footprint; correct the location or geometry",
        )


@router.post("/buildings", dependencies=[Depends(check_csrf)], status_code=201)
def create_building(body: schemas.PropertyRegistration, db: Session = Depends(get_db), user=Depends(require_user)):
    if body.geometry:
        assess_geometry(body.geometry)
        consistent_geometry(body)
    data = body.model_dump(exclude={"roof_map_estimate"})
    prop = Property(
        **data,
        owner_id=user.id,
        organisation_id=user.organisation_id,
        property_code=f"{'MH' if body.state.casefold() == 'maharashtra' else body.country}-PROP-{secrets.token_hex(4).upper()}",
        measurement_status="user_entered" if body.effective_catchment_m2 else "unverified",
    )
    db.add(prop)
    db.flush()
    apply_footprint(db, prop)
    if body.roof_map_estimate:
        record_map_roof_estimate(db, prop, user, body.roof_map_estimate)
    db.add(
        WaterTank(
            property_id=prop.id,
            capacity_l=prop.tank_capacity_l,
            provenance={"source": "user_entered", "user_id": user.id},
        )
    )
    db.add(
        WaterDemand(
            property_id=prop.id,
            daily_l=prop.daily_demand_l,
            provenance={"source": "user_entered", "user_id": user.id},
        )
    )
    if prop.effective_catchment_m2 and not body.roof_map_estimate:
        db.add(
            RoofMeasurement(
                property_id=prop.id,
                user_id=user.id,
                area_m2=prop.effective_catchment_m2,
                method="Registration input",
                evidence_note="Owner-entered catchment estimate; not field verified",
                measured_at=now(),
                status="user_entered",
            )
        )
    audit(db, user, "property.register", prop.id, {"geometry_source": prop.geometry_source})
    db.commit()
    return ok(property_data(prop))


def record_map_roof_estimate(db, prop, user, confirmation):
    assessment = assess_geometry(prop.geometry)
    prop.effective_catchment_m2 = assessment["area_m2"] * confirmation.connected_fraction
    if not 0 < prop.effective_catchment_m2 <= 1e8:
        raise HTTPException(422, "The map-derived roof area is outside the supported range")
    prop.roof_area_provenance = {
        "basis": "user_confirmed_map_estimate",
        "source": prop.geometry_source,
        "source_id": prop.geometry_source_id,
        "outline_area_m2": assessment["area_m2"],
        "connected_fraction": confirmation.connected_fraction,
        "area_m2": prop.effective_catchment_m2,
        "method": assessment["method"],
        "confirmed_by": user.id,
        "confirmed_at": now().isoformat(),
        "field_verified": False,
        "limitations": [
            "User confirmation identifies the outline; it is not a physical roof measurement.",
            "Connected fraction is a user assumption; roof slope, extensions and pipe connections are not established by the map.",
        ],
    }
    if prop.measurement_status != "planning_assumptions":
        prop.measurement_status = "map_estimated"
    prop.parameters_updated_at = now()
    db.add(RoofMeasurement(
        property_id=prop.id, user_id=user.id, area_m2=prop.effective_catchment_m2,
        method="User-confirmed map outline estimate", measured_at=now(), status="map_estimated",
        evidence_note=f"Source: {prop.geometry_source}; outline area {assessment['area_m2']:.2f} m²; "
                      f"assumed connected fraction {confirmation.connected_fraction:.4f}. Not field measured.",
    ))
    audit(db, user, "roof.map_estimate_confirm", prop.id, prop.roof_area_provenance)


@router.get("/buildings/{property_id}")
def building_detail(property_id: str, db: Session = Depends(get_db), user=Depends(require_user)):
    prop = authorised_property(db, property_id, user)
    return ok(
        {
            **property_data(prop),
            "measurements": [
                row_data(row)
                for row in db.scalars(
                    select(RoofMeasurement)
                    .where(RoofMeasurement.property_id == prop.id)
                    .order_by(RoofMeasurement.measured_at.desc())
                )
            ],
            "observations": [
                row_data(row)
                for row in db.scalars(
                    select(RainfallObservation)
                    .where(RainfallObservation.property_id == prop.id)
                    .order_by(RainfallObservation.measured_at.desc())
                )
            ],
            "photos": [
                row_data(row, exclude=("filename",))
                for row in db.scalars(select(PropertyPhoto).where(PropertyPhoto.property_id == prop.id))
            ],
        }
    )


@router.patch("/buildings/{property_id}", dependencies=[Depends(check_csrf)])
def patch_building(
    property_id: str, body: schemas.PropertyPatch, db: Session = Depends(get_db), user=Depends(require_user)
):
    prop = authorised_property(db, property_id, user)
    changes = body.model_dump(exclude_unset=True)
    map_request = changes.pop("roof_map_estimate", None)
    if map_request and "effective_catchment_m2" in changes:
        raise HTTPException(422, "Choose a map estimate or a manually entered roof area")
    was_planning = prop.measurement_status == "planning_assumptions"
    planning = changes.pop("planning_assumptions", was_planning)
    if planning and changes.get("storage_status") == "measured":
        raise HTTPException(422, "Planning assumptions cannot be recorded as measured tank readings")
    if planning:
        changes["storage_status"] = "estimated"
    current = {name: getattr(prop, name) for name in schemas.PropertyCreate.model_fields}
    try:
        validated = schemas.PropertyCreate.model_validate({**current, **changes})
    except ValidationError as exc:
        raise HTTPException(422, "Updated inputs violate physical or validation constraints") from exc
    if validated.geometry:
        assess_geometry(validated.geometry)
        consistent_geometry(validated)
    if map_request and not validated.geometry:
        raise HTTPException(422, "Select or draw a building outline before using a map estimate")
    for key, value in validated.model_dump().items():
        setattr(prop, key, value)
    roof_fields = {
        "effective_catchment_m2",
        "runoff_coefficient",
        "coefficient_source",
        "roof_material",
        "latitude",
        "longitude",
        "timezone",
        "geometry",
    }
    roof_changes = {key for key in roof_fields if key in changes and getattr(validated, key) != current[key]}
    if roof_changes or planning != was_planning:
        prop.parameters_updated_at = now()
    if {"geometry", "latitude", "longitude", "effective_catchment_m2"} & roof_changes:
        prop.roof_area_provenance = {}
    if planning:
        prop.measurement_status = "planning_assumptions"
    elif roof_changes or was_planning:
        prop.measurement_status = "user_entered" if prop.effective_catchment_m2 else "unverified"
    if "effective_catchment_m2" in roof_changes and not planning and not map_request:
        prop.measurement_status = "user_entered" if prop.effective_catchment_m2 else "unverified"
        if prop.effective_catchment_m2:
            db.add(
                RoofMeasurement(
                    property_id=prop.id,
                    user_id=user.id,
                    area_m2=prop.effective_catchment_m2,
                    method="Property correction",
                    evidence_note="Owner-entered correction; requires field verification",
                    measured_at=now(),
                    status="user_entered",
                )
            )
    if {"geometry", "geometry_source", "geometry_source_id", "geometry_source_uri"} & changes.keys():
        apply_footprint(db, prop)
    if map_request:
        record_map_roof_estimate(db, prop, user, schemas.RoofMapConfirmation.model_validate(map_request))
    elif prop.roof_area_provenance and not planning:
        prop.measurement_status = "map_estimated"
    if "current_storage_l" in changes and "storage_measured_at" not in changes:
        prop.storage_measured_at = now()
    if "tank_capacity_l" in changes:
        tank = db.scalar(select(WaterTank).where(WaterTank.property_id == prop.id))
        tank.capacity_l = prop.tank_capacity_l
        tank.provenance = {
            "source": "planning_assumption" if planning else "user_entered",
            "updated_at": now().isoformat(),
        }
    if "daily_demand_l" in changes:
        db.add(
            WaterDemand(
                property_id=prop.id,
                daily_l=prop.daily_demand_l,
                provenance={
                    "source": "planning_assumption" if planning else "user_entered",
                    "user_id": user.id,
                },
            )
        )
    audit(
        db,
        user,
        "property.update",
        prop.id,
        {
            "fields": sorted(changes),
            "input_basis": "planning_assumptions" if planning else "owner_entered",
        },
    )
    db.commit()
    return ok(property_data(prop))


@router.post("/buildings/{property_id}/measurements", dependencies=[Depends(check_csrf)])
def measure_roof(
    property_id: str, body: schemas.Measurement, db: Session = Depends(get_db), user=Depends(require_user)
):
    prop = authorised_property(db, property_id, user)
    measurement = RoofMeasurement(property_id=prop.id, user_id=user.id, **body.model_dump())
    db.add(measurement)
    prop.effective_catchment_m2, prop.measurement_status = body.area_m2, body.status
    prop.roof_area_provenance = {}
    prop.parameters_updated_at = now()
    audit(
        db,
        user,
        "roof.measurement",
        prop.id,
        {"status": body.status, "verification": "owner_recorded_field_evidence"},
    )
    db.commit()
    return ok(
        property_data(prop),
        verification="Field verification is owner-recorded evidence, not independent engineering certification",
    )


@router.post("/buildings/{property_id}/photos", dependencies=[Depends(check_csrf)])
async def upload_photo(
    property_id: str, file: UploadFile, db: Session = Depends(get_db), user=Depends(require_user)
):
    prop = authorised_property(db, property_id, user)
    if file.content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(415, "Upload a JPEG or PNG photo")
    content = await file.read(settings.upload_max_bytes + 1)
    if len(content) > settings.upload_max_bytes:
        raise HTTPException(413, "Photo exceeds the upload size limit")
    try:
        Image.MAX_IMAGE_PIXELS = 20_000_000
        with Image.open(BytesIO(content)) as image:
            if image.format not in {"JPEG", "PNG"} or image.width * image.height > 20_000_000:
                raise ValueError("Invalid image")
            image.load()
            image = image.convert("RGB")
            image.thumbnail((2400, 2400))
            output = BytesIO()
            image.save(
                output, format="JPEG", quality=88
            )  # Re-encoding strips EXIF/GPS and untrusted metadata.
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(422, "Image could not be safely decoded") from exc
    filename = f"{secrets.token_hex(20)}.jpg"
    payload = output.getvalue()
    if settings.runtime_mode == "serverless" and len(payload) > 4_000_000:
        raise HTTPException(413, "Choose a smaller photo; the hosted upload limit is 4 MB")
    await save_photo(filename, payload, ROOT)
    record = PropertyPhoto(
        property_id=prop.id, user_id=user.id, filename=filename, mime_type="image/jpeg", size=len(payload)
    )
    db.add(record)
    audit(db, user, "property.photo", prop.id)
    db.commit()
    return ok(row_data(record, exclude=("filename",)))


@router.get("/buildings/{property_id}/photos/{photo_id}")
async def download_photo(
    property_id: str, photo_id: str, db: Session = Depends(get_db), user=Depends(require_user)
):
    authorised_property(db, property_id, user)
    record = db.get(PropertyPhoto, photo_id)
    if not record or record.property_id != property_id:
        raise HTTPException(404, "Photo unavailable")
    return await read_photo(record.filename, ROOT)


def weather_location(db, user, property_id, latitude, longitude, timezone):
    if property_id:
        prop = authorised_property(db, property_id, user)
        return prop.latitude, prop.longitude, prop.timezone, prop.id
    if latitude is None or longitude is None:
        raise HTTPException(422, "Select a property or supply coordinates")
    import math
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    if not math.isfinite(latitude) or not math.isfinite(longitude) or not -85 <= latitude <= 85 or not -180 <= longitude <= 180:
        raise HTTPException(422, "Supply valid finite WGS84 coordinates")
    try:
        ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise HTTPException(422, "Use a valid IANA property timezone") from exc
    return latitude, longitude, timezone, None


@router.get("/weather/forecast")
async def get_forecast(
    property_id: str | None = None,
    latitude: float | None = Query(default=None, ge=-85, le=85),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    timezone: str = "Asia/Kolkata",
    days: int = Query(default=7, ge=1, le=14),
    refresh: bool = False,
    db: Session = Depends(get_db),
    user=Depends(require_user),
):
    lat, lon, zone, pid = weather_location(db, user, property_id, latitude, longitude, timezone)
    return ok(await forecast(db, lat, lon, zone, days, pid, refresh))


@router.get("/weather/tomorrow")
async def tomorrow(
    property_id: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    timezone: str = "Asia/Kolkata",
    db: Session = Depends(get_db),
    user=Depends(require_user),
):
    lat, lon, zone, pid = weather_location(db, user, property_id, latitude, longitude, timezone)
    data = await forecast(db, lat, lon, zone, 7, pid)
    return ok(
        {
            **data["tomorrow"],
            **{
                key: data[key]
                for key in (
                    "provider",
                    "retrieved_at",
                    "issue_time",
                    "timezone",
                    "stale",
                    "attribution",
                    "spatial_resolution",
                )
            },
        }
    )


@router.get("/weather/historical")
async def history(
    start_date: date,
    end_date: date,
    property_id: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    timezone: str = "Asia/Kolkata",
    provider: str = "open_meteo",
    db: Session = Depends(get_db),
    user=Depends(require_user),
):
    lat, lon, zone, _ = weather_location(db, user, property_id, latitude, longitude, timezone)
    return ok(await historical(db, lat, lon, zone, start_date, end_date, provider))


@router.get("/weather/imd/{product}")
async def imd_product(product: str, user=Depends(require_user)):
    return ok(await official_product(product))


@router.post("/rainwater/calculate", dependencies=[Depends(check_csrf)])
def calculator(body: schemas.Calculate, user=Depends(require_user)):
    return ok(calculate(**body.model_dump()))


@router.post("/rainwater/forecast", dependencies=[Depends(check_csrf)])
async def forecast_water(
    body: schemas.ForecastRun, db: Session = Depends(get_db), user=Depends(require_user)
):
    prop = authorised_property(db, body.property_id, user)
    payload = await run_twin(db, prop, body.days)
    audit(db, user, "water_twin.forecast", prop.id)
    db.commit()
    return ok({**payload, **snapshot_status(prop, payload)})


class Scenario(schemas.ForecastRun):
    capacity_l: schemas.Nonnegative
    daily_demand_l: schemas.Nonnegative


@router.post("/rainwater/scenario", dependencies=[Depends(check_csrf)])
async def scenario(body: Scenario, db: Session = Depends(get_db), user=Depends(require_user)):
    prop = authorised_property(db, body.property_id, user)
    return ok(await run_twin(db, prop, body.days, body.capacity_l, body.daily_demand_l, persist=False))


@router.get("/rainwater/history/{property_id}")
def calculations(property_id: str, db: Session = Depends(get_db), user=Depends(require_user)):
    prop = authorised_property(db, property_id, user)
    rows = db.scalars(
        select(RainwaterCalculation)
        .where(RainwaterCalculation.property_id == prop.id)
        .order_by(RainwaterCalculation.created_at.desc())
        .limit(100)
    )
    return ok([{**row.payload, **snapshot_status(prop, row.payload), "id": row.id, "created_at": row.created_at.isoformat()} for row in rows])


@router.get("/storage/{property_id}")
def storage(property_id: str, db: Session = Depends(get_db), user=Depends(require_user)):
    prop = authorised_property(db, property_id, user)
    latest = db.scalar(
        select(RainwaterCalculation)
        .where(RainwaterCalculation.property_id == prop.id)
        .order_by(RainwaterCalculation.created_at.desc())
    )
    return ok(
        {
            "property": property_data(prop),
            "tank": {
                "capacity_l": prop.tank_capacity_l,
                "current_storage_l": prop.current_storage_l,
                "measurement_status": prop.storage_status,
                "measured_at": prop.storage_measured_at.isoformat(),
            },
            "observations": [
                row_data(row)
                for row in db.scalars(
                    select(RainfallObservation)
                    .where(RainfallObservation.property_id == prop.id)
                    .order_by(RainfallObservation.measured_at.desc())
                    .limit(100)
                )
            ],
            "latest_simulation": {**latest.payload, **snapshot_status(prop, latest.payload), "id": latest.id} if latest else None,
        }
    )


@router.post("/storage/optimise", dependencies=[Depends(check_csrf)])
async def storage_optimise(body: schemas.Optimise, db: Session = Depends(get_db), user=Depends(require_user)):
    prop = authorised_property(db, body.property_id, user)
    inputs = modelling_inputs(prop)
    data = await historical(
        db, prop.latitude, prop.longitude, prop.timezone, body.start_date, body.end_date, body.provider
    )
    candidates = sorted(set([*body.capacities_l, prop.tank_capacity_l]))
    result = optimise(
        data["daily"],
        candidates,
        **inputs,
        daily_demand_l=prop.daily_demand_l,
        initial_storage_l=0,
        cost_per_l_inr=body.cost_per_l_inr,
        available_space_m2=prop.available_space_m2,
    )
    return ok(
        {
            **result,
            "historical": {key: value for key, value in data.items() if key != "daily"},
            "current_capacity_l": prop.tank_capacity_l,
            "input_basis": "planning_assumptions"
            if prop.measurement_status == "planning_assumptions"
            else "owner_entered",
            "limitations": result.get("limitations", [])
            + [
                "Initial historical storage is assumed empty for all capacities; forecast current storage is not a past observation."
            ]
            + (
                [
                    "Roof, collection, tank and demand inputs are illustrative planning assumptions; verify them before selecting equipment."
                ]
                if prop.measurement_status == "planning_assumptions"
                else []
            ),
        }
    )


@router.post("/recommendations/generate", dependencies=[Depends(check_csrf)])
def recommendations(body: schemas.PropertyRequest, db: Session = Depends(get_db), user=Depends(require_user)):
    return ok(generate(db, authorised_property(db, body.property_id, user)))


@router.get("/recommendations/{property_id}")
def get_recommendations(property_id: str, db: Session = Depends(get_db), user=Depends(require_user)):
    prop = authorised_property(db, property_id, user)
    return ok(latest_recommendation(db, prop.id))
