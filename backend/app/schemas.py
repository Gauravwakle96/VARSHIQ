from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Nonnegative = Annotated[float, Field(ge=0, le=1e10)]
Positive = Annotated[float, Field(gt=0, le=1e8)]
Fraction = Annotated[float, Field(ge=0, le=1)]


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)


class Register(Schema):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class Login(Schema):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class PropertyCreate(Schema):
    name: str = Field(min_length=2, max_length=160)
    property_type: Literal["residential", "commercial", "apartment", "community"]
    locality: str = Field(min_length=2, max_length=120)
    country: str = Field(default="IN", pattern="^[A-Z]{2}$")
    state: str = Field(default="", max_length=120)
    district: str = Field(default="", max_length=120)
    city: str = Field(default="", max_length=120)
    postcode: str = Field(default="", max_length=20)
    location_source: Literal["user_entered", "osm", "gps"] = "user_entered"
    administrative_ids: dict[str, str] = Field(default_factory=dict, max_length=12)
    latitude: float = Field(ge=-85, le=85)
    longitude: float = Field(ge=-180, le=180)
    timezone: str = "Asia/Kolkata"
    geometry: dict | None = None
    geometry_source: Literal["manual", "osm", "microsoft"] = "manual"
    geometry_source_id: str | None = Field(default=None, max_length=200)
    geometry_source_uri: str | None = Field(default=None, max_length=2000)
    effective_catchment_m2: Positive | None = None
    roof_material: Literal["rcc", "concrete", "metal", "tile", "other"] = "other"
    runoff_coefficient: Fraction | None = None
    coefficient_source: str = Field(default="", max_length=2000)
    first_flush_mm: float = Field(default=0, ge=0, le=20)
    collection_efficiency: Fraction = 1
    tank_capacity_l: Nonnegative = 0
    current_storage_l: Nonnegative = 0
    daily_demand_l: Nonnegative = 0
    storage_status: Literal["estimated", "measured"] = "estimated"
    storage_measured_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    available_space_m2: Positive | None = None
    share_aggregate: bool = False
    notes: str = Field(default="", max_length=8000)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Use an IANA timezone such as Asia/Kolkata") from exc
        return value

    @field_validator("storage_measured_at")
    @classmethod
    def storage_time(cls, value):
        return measured_time(value)

    @model_validator(mode="after")
    def physical_inputs(self):
        if self.current_storage_l > self.tank_capacity_l:
            raise ValueError("Current storage cannot exceed tank capacity")
        if self.runoff_coefficient is not None and not self.coefficient_source:
            raise ValueError("Document the source or assumption for the runoff coefficient")
        return self


class PropertyPatch(Schema):
    name: str | None = None
    property_type: Literal["residential", "commercial", "apartment", "community"] | None = None
    locality: str | None = None
    country: str | None = None
    state: str | None = None
    district: str | None = None
    city: str | None = None
    postcode: str | None = None
    location_source: str | None = None
    administrative_ids: dict[str, str] | None = None
    latitude: float | None = None
    longitude: float | None = None
    timezone: str | None = None
    geometry: dict | None = None
    geometry_source: Literal["manual", "osm", "microsoft"] | None = None
    geometry_source_id: str | None = None
    geometry_source_uri: str | None = None
    effective_catchment_m2: Positive | None = None
    roof_material: Literal["rcc", "concrete", "metal", "tile", "other"] | None = None
    runoff_coefficient: Fraction | None = None
    coefficient_source: str | None = None
    first_flush_mm: float | None = None
    collection_efficiency: Fraction | None = None
    tank_capacity_l: Nonnegative | None = None
    current_storage_l: Nonnegative | None = None
    daily_demand_l: Nonnegative | None = None
    storage_status: Literal["estimated", "measured"] | None = None
    storage_measured_at: datetime | None = None
    available_space_m2: Positive | None = None
    share_aggregate: bool | None = None
    notes: str | None = None


def measured_time(value):
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Measurements require a timezone-aware timestamp")
    if value > datetime.now(UTC) + timedelta(minutes=5):
        raise ValueError("An actual measurement cannot be in the future")
    return value.astimezone(UTC)


class Measurement(Schema):
    area_m2: Positive
    method: str = Field(min_length=3, max_length=160)
    evidence_note: str = Field(min_length=5, max_length=4000)
    measured_at: datetime
    status: Literal["user_entered", "field_verified"]

    @field_validator("measured_at")
    @classmethod
    def aware_time(cls, value):
        return measured_time(value)


class Observation(Schema):
    property_id: str
    kind: Literal["storage", "rainfall", "collection", "overflow", "first_flush", "maintenance"]
    measured_at: datetime
    interval_start: datetime | None = None
    interval_end: datetime | None = None
    value: Nonnegative | None = None
    unit: Literal["L", "mm", "note"]
    method: str = Field(min_length=3, max_length=160)
    reliability: Literal["measured", "estimated"]
    notes: str = Field(default="", max_length=4000)

    @field_validator("measured_at", "interval_start", "interval_end")
    @classmethod
    def aware_time(cls, value):
        return measured_time(value) if value is not None else value

    @model_validator(mode="after")
    def observation_units(self):
        required = "mm" if self.kind == "rainfall" else "note" if self.kind == "maintenance" else "L"
        if self.unit != required:
            raise ValueError(f"{self.kind} observations require {required} units")
        if self.kind != "maintenance" and self.value is None:
            raise ValueError("A measurement value is required")
        if self.kind in {"rainfall", "collection", "overflow", "first_flush"}:
            if self.interval_start is None or self.interval_end is None:
                raise ValueError("Accumulated measurements require interval start and end")
        if self.interval_start is not None or self.interval_end is not None:
            if self.interval_start is None or self.interval_end is None:
                raise ValueError("Provide both interval timestamps")
            if self.interval_end <= self.interval_start or self.interval_end > self.measured_at:
                raise ValueError("Measurement interval must be positive and end by the measurement time")
        return self


class Calculate(Schema):
    area_m2: Positive
    rainfall_mm: Nonnegative
    runoff_coefficient: Fraction
    first_flush_mm: float = Field(ge=0, le=20)
    collection_efficiency: Fraction


class ForecastRun(Schema):
    property_id: str
    days: int = Field(default=7, ge=1, le=14)


class Optimise(Schema):
    property_id: str
    capacities_l: list[Nonnegative] = Field(min_length=2, max_length=20)
    start_date: date
    end_date: date
    cost_per_l_inr: Nonnegative | None = None
    provider: Literal["open_meteo", "imd"] = "open_meteo"

    @model_validator(mode="after")
    def period(self):
        if self.end_date < self.start_date:
            raise ValueError("Historical end date must follow start date")
        if (self.end_date - self.start_date).days > 3660:
            raise ValueError("Select at most ten years per optimisation")
        if len(set(self.capacities_l)) < 2:
            raise ValueError("Compare at least two distinct capacities")
        return self


class PropertyRequest(Schema):
    property_id: str


class GeometryRequest(Schema):
    geometry: dict


class Chat(Schema):
    property_id: str | None = None
    message: str = Field(min_length=2, max_length=2000)


class SystemSettings(Schema):
    pilot_locality: str = Field(min_length=2, max_length=120)
    pilot_latitude: float = Field(ge=-85, le=85)
    pilot_longitude: float = Field(ge=-180, le=180)
    pilot_timezone: str
