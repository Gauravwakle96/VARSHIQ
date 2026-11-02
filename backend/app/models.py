import uuid
from datetime import UTC, datetime

from geoalchemy2 import Geometry
from sqlalchemy import JSON, Boolean, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, engine
from app.database import UTCDateTime as DateTime


def now():
    return datetime.now(UTC)


def uid():
    return str(uuid.uuid4())


class Identity:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Organisation(Identity, Base):
    __tablename__ = "organisations"
    name: Mapped[str] = mapped_column(String(160))


class User(Identity, Base):
    __tablename__ = "users"
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default="owner")
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True)


class AuthSession(Identity, Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Property(Identity, Base):
    __tablename__ = "properties"
    property_code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    property_type: Mapped[str] = mapped_column(String(20))
    locality: Mapped[str] = mapped_column(String(120))
    country: Mapped[str] = mapped_column(String(2), default="IN")
    state: Mapped[str] = mapped_column(String(120), default="")
    district: Mapped[str] = mapped_column(String(120), default="")
    city: Mapped[str] = mapped_column(String(120), default="")
    postcode: Mapped[str] = mapped_column(String(20), default="")
    location_source: Mapped[str] = mapped_column(String(40), default="user_entered")
    administrative_ids: Mapped[dict] = mapped_column(JSON, default=dict)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    timezone: Mapped[str] = mapped_column(String(60), default="Asia/Kolkata")
    geometry: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    geometry_source: Mapped[str] = mapped_column(String(30), default="manual")
    geometry_source_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    geometry_source_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    footprint_area_m2: Mapped[float | None] = mapped_column(Float, nullable=True)
    effective_catchment_m2: Mapped[float | None] = mapped_column(Float, nullable=True)
    roof_area_provenance: Mapped[dict] = mapped_column(JSON, default=dict)
    measurement_status: Mapped[str] = mapped_column(String(30), default="unverified")
    roof_material: Mapped[str] = mapped_column(String(20), default="other")
    runoff_coefficient: Mapped[float | None] = mapped_column(Float, nullable=True)
    coefficient_source: Mapped[str] = mapped_column(Text, default="")
    first_flush_mm: Mapped[float] = mapped_column(Float, default=0)
    collection_efficiency: Mapped[float] = mapped_column(Float, default=1)
    tank_capacity_l: Mapped[float] = mapped_column(Float, default=0)
    current_storage_l: Mapped[float] = mapped_column(Float, default=0)
    daily_demand_l: Mapped[float] = mapped_column(Float, default=0)
    storage_measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    storage_status: Mapped[str] = mapped_column(String(20), default="estimated")
    available_space_m2: Mapped[float | None] = mapped_column(Float, nullable=True)
    share_aggregate: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    parameters_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class BuildingFootprint(Identity, Base):
    __tablename__ = "building_footprints"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    source: Mapped[str] = mapped_column(String(40))
    source_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    area_m2: Mapped[float] = mapped_column(Float)
    geometry_json: Mapped[dict] = mapped_column(JSON)
    spatial_geometry = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326) if engine.dialect.name == "postgresql" else JSON,
        nullable=True,
    )
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)


class RoofMeasurement(Identity, Base):
    __tablename__ = "roof_measurements"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    area_m2: Mapped[float] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(160))
    evidence_note: Mapped[str] = mapped_column(Text)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30))


class RoofMaterial(Identity, Base):
    __tablename__ = "roof_materials"
    name: Mapped[str] = mapped_column(String(60), unique=True)
    guidance: Mapped[dict] = mapped_column(JSON, default=dict)


class WeatherForecast(Identity, Base):
    __tablename__ = "weather_forecasts"
    property_id: Mapped[str | None] = mapped_column(ForeignKey("properties.id"), nullable=True, index=True)
    cache_key: Mapped[str] = mapped_column(String(200), index=True)
    provider: Mapped[str] = mapped_column(String(40))
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    issue_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON)


class RainfallObservation(Identity, Base):
    __tablename__ = "rainfall_observations"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(30))
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    interval_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    interval_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(10))
    method: Mapped[str] = mapped_column(String(160))
    reliability: Mapped[str] = mapped_column(String(20))
    notes: Mapped[str] = mapped_column(Text, default="")
    parameter_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)


class StorageMeasurement(Identity, Base):
    __tablename__ = "storage_measurements"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    observation_id: Mapped[str] = mapped_column(ForeignKey("rainfall_observations.id"))
    volume_l: Mapped[float] = mapped_column(Float)


class WaterTank(Identity, Base):
    __tablename__ = "water_tanks"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), unique=True)
    capacity_l: Mapped[float] = mapped_column(Float)
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)


class WaterDemand(Identity, Base):
    __tablename__ = "water_demand"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    daily_l: Mapped[float] = mapped_column(Float)
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)


class RainfallEvent(Identity, Base):
    __tablename__ = "rainfall_events"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    forecast_id: Mapped[str] = mapped_column(ForeignKey("weather_forecasts.id"))
    calculation_id: Mapped[str] = mapped_column(ForeignKey("rainwater_calculations.id"))
    payload: Mapped[dict] = mapped_column(JSON)


class RainwaterCalculation(Identity, Base):
    __tablename__ = "rainwater_calculations"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    forecast_id: Mapped[str] = mapped_column(ForeignKey("weather_forecasts.id"))
    payload: Mapped[dict] = mapped_column(JSON)


class HarvestingSystem(Identity, Base):
    __tablename__ = "harvesting_systems"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    system_type: Mapped[str] = mapped_column(String(40))
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class Recommendation(Identity, Base):
    __tablename__ = "recommendations"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    payload: Mapped[dict] = mapped_column(JSON)


class GroundwaterData(Identity, Base):
    __tablename__ = "groundwater_data"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    provenance: Mapped[dict] = mapped_column(JSON)
    payload: Mapped[dict] = mapped_column(JSON)


class SoilData(Identity, Base):
    __tablename__ = "soil_data"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    provenance: Mapped[dict] = mapped_column(JSON)
    payload: Mapped[dict] = mapped_column(JSON)


class DataSource(Identity, Base):
    __tablename__ = "data_sources"
    name: Mapped[str] = mapped_column(String(60), unique=True)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[dict] = mapped_column(JSON, default=dict)


class ForecastAccuracy(Identity, Base):
    __tablename__ = "forecast_accuracy"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    observation_id: Mapped[str] = mapped_column(ForeignKey("rainfall_observations.id"), unique=True)
    forecast_id: Mapped[str] = mapped_column(ForeignKey("weather_forecasts.id"))
    predicted_mm: Mapped[float] = mapped_column(Float)
    observed_mm: Mapped[float] = mapped_column(Float)
    lead_hours: Mapped[float] = mapped_column(Float)


class CalibrationRecord(Identity, Base):
    __tablename__ = "calibration_records"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    payload: Mapped[dict] = mapped_column(JSON)


class Report(Identity, Base):
    __tablename__ = "reports"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    payload: Mapped[dict] = mapped_column(JSON)


class AuditLog(Identity, Base):
    __tablename__ = "audit_logs"
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(100))
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class PropertyPhoto(Identity, Base):
    __tablename__ = "property_photos"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    filename: Mapped[str] = mapped_column(String(100))
    mime_type: Mapped[str] = mapped_column(String(40))
    size: Mapped[int] = mapped_column(Integer)


class WaterSource(Identity, Base):
    __tablename__ = "water_sources"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    source_type: Mapped[str] = mapped_column(String(20))
    volume_l: Mapped[float] = mapped_column(Float)
    interval_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    interval_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    method: Mapped[str] = mapped_column(String(160))
    reliability: Mapped[str] = mapped_column(String(20))
    notes: Mapped[str] = mapped_column(Text, default="")


class WaterConsumption(Identity, Base):
    __tablename__ = "water_consumption"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    use_type: Mapped[str] = mapped_column(String(30))
    source_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    volume_l: Mapped[float] = mapped_column(Float)
    interval_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    interval_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    method: Mapped[str] = mapped_column(String(160))
    reliability: Mapped[str] = mapped_column(String(20))
    notes: Mapped[str] = mapped_column(Text, default="")


class MaintenanceRecord(Identity, Base):
    __tablename__ = "maintenance_records"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    task: Mapped[str] = mapped_column(String(30))
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    condition: Mapped[str] = mapped_column(String(20))
    next_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class WaterQualityRecord(Identity, Base):
    __tablename__ = "water_quality_records"
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    tested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ph: Mapped[float | None] = mapped_column(Float, nullable=True)
    tds_mg_l: Mapped[float | None] = mapped_column(Float, nullable=True)
    turbidity_ntu: Mapped[float | None] = mapped_column(Float, nullable=True)
    laboratory: Mapped[str] = mapped_column(String(160))
    method: Mapped[str] = mapped_column(String(160))
    treatment_status: Mapped[str] = mapped_column(String(160))
    notes: Mapped[str] = mapped_column(Text, default="")


class LocationCache(Base):
    __tablename__ = "location_cache"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    payload: Mapped[dict] = mapped_column(JSON)


class RequestRateLimit(Base):
    __tablename__ = "request_rate_limits"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


Index("ix_forecast_location_time", WeatherForecast.cache_key, WeatherForecast.retrieved_at)
