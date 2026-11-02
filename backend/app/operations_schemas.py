"""Validated owner records; forecasts never become measured source volumes."""
from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas import Nonnegative, Positive, Schema, measured_time

SourceType = Literal["municipal", "rainwater", "borewell", "tanker", "greywater"]
Task = Literal[
    "roof_cleaning", "drain_cleaning", "filter_cleaning", "tank_cleaning",
    "pipe_inspection", "first_flush", "overflow_inspection",
]


class VolumeRecord(Schema):
    property_id: str
    volume_l: Nonnegative
    interval_start: datetime
    interval_end: datetime
    method: str = Field(min_length=3, max_length=160)
    reliability: Literal["measured", "estimated"]
    notes: str = Field(default="", max_length=4000)

    @field_validator("interval_start", "interval_end")
    @classmethod
    def past_aware(cls, value):
        return measured_time(value)

    @model_validator(mode="after")
    def interval(self):
        if self.interval_end <= self.interval_start:
            raise ValueError("Record interval must have positive elapsed time")
        return self


class SourceRecord(VolumeRecord):
    source_type: SourceType


class ConsumptionRecord(VolumeRecord):
    use_type: Literal["drinking_cooking", "cleaning", "gardening", "toilets", "commercial", "industrial", "other"]
    source_type: SourceType | None = None


class Maintenance(Schema):
    property_id: str
    task: Task
    performed_at: datetime
    condition: Literal["good", "needs_attention", "unknown"]
    next_due_at: datetime | None = None
    notes: str = Field(default="", max_length=4000)

    @field_validator("performed_at")
    @classmethod
    def past_aware(cls, value):
        return measured_time(value)

    @model_validator(mode="after")
    def due_time(self):
        if self.next_due_at is not None:
            if self.next_due_at.tzinfo is None or self.next_due_at.utcoffset() is None:
                raise ValueError("Next inspection date needs a timezone")
            if self.next_due_at <= self.performed_at:
                raise ValueError("Next inspection must follow the recorded inspection")
        return self


class Quality(Schema):
    property_id: str
    tested_at: datetime
    ph: float | None = Field(default=None, ge=0, le=14)
    tds_mg_l: float | None = Field(default=None, ge=0, le=100000)
    turbidity_ntu: float | None = Field(default=None, ge=0, le=100000)
    laboratory: str = Field(min_length=3, max_length=160)
    method: str = Field(min_length=3, max_length=160)
    treatment_status: str = Field(min_length=2, max_length=160)
    notes: str = Field(default="", max_length=4000)

    @field_validator("tested_at")
    @classmethod
    def past_aware(cls, value):
        return measured_time(value)

    @model_validator(mode="after")
    def measurement_required(self):
        if all(value is None for value in (self.ph, self.tds_mg_l, self.turbidity_ntu)):
            raise ValueError("Record at least one actual water-quality test result")
        return self


class Investment(Schema):
    property_id: str
    capacity_l: Positive
    cost_inr: float = Field(gt=0, le=1e9, multiple_of=0.01)
    quote_source: str = Field(min_length=5, max_length=1000)
    installation_space_confirmed: bool


class CommunityBudget(Schema):
    budget_inr: float = Field(gt=0, le=1e9, multiple_of=0.01)
    start_date: date
    end_date: date
    provider: Literal["open_meteo", "imd"] = "open_meteo"
    options: list[Investment] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def coverage(self):
        if self.end_date < self.start_date or (self.end_date - self.start_date).days > 3660:
            raise ValueError("Select a complete historical period of at most ten years")
        pairs = [(option.property_id, option.capacity_l) for option in self.options]
        if len(set(pairs)) != len(pairs):
            raise ValueError("Provide a single quotation for each property and capacity")
        return self
