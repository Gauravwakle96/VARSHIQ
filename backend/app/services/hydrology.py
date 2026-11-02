"""Deterministic rainwater balances; amounts are litres, depths millimetres.

No roof coefficient is inferred here. A first-flush depth is rainfall-equivalent:
its event diversion budget is area * depth * runoff coefficient. Collection
efficiency applies once, after diversion. Hourly timestamps identify interval
starts; capture occurs before demand within each interval (a conservative
overflow convention). Forecast event state is not evidence of physical diversion.
"""

from __future__ import annotations

import math
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def _number(name: str, value: Any, minimum: float = 0, maximum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a finite number")
    try:
        result = float(value)
    except (OverflowError, ValueError) as exc:
        raise ValueError(f"{name} must be a finite number") from exc
    if not math.isfinite(result) or result < minimum or (maximum is not None and result > maximum):
        bound = f" between {minimum} and {maximum}" if maximum is not None else f" >= {minimum}"
        raise ValueError(f"{name} must be finite and{bound}")
    return result


def _roof(
    area_m2: float, runoff_coefficient: float, first_flush_mm: float, collection_efficiency: float
) -> tuple[float, float, float, float]:
    area = _number("area_m2", area_m2)
    if area == 0:
        raise ValueError("area_m2 must be positive")
    coefficient = _number("runoff_coefficient", runoff_coefficient, maximum=1)
    flush = _number("first_flush_mm", first_flush_mm)
    efficiency = _number("collection_efficiency", collection_efficiency, maximum=1)
    if not math.isfinite(area * coefficient * flush):
        raise ValueError("first-flush budget exceeds finite numeric range")
    return area, coefficient, flush, efficiency


def _timestamp(value: Any, name: str = "time") -> datetime:
    try:
        parsed = (
            value
            if isinstance(value, datetime)
            else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        )
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be an ISO timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{name} must include its timezone offset")
    return parsed


def _rain(record: dict[str, Any]) -> float:
    if "precipitation_mm" not in record:
        raise ValueError("Every interval requires precipitation_mm; missing rain is not zero")
    return _number("precipitation_mm", record["precipitation_mm"])


def calculate(
    area_m2: float,
    rainfall_mm: float,
    runoff_coefficient: float,
    first_flush_mm: float,
    collection_efficiency: float,
) -> dict[str, Any]:
    """One rainfall event, independent of storage. Probability is not an input."""
    area, coefficient, flush, efficiency = _roof(
        area_m2, runoff_coefficient, first_flush_mm, collection_efficiency
    )
    rain = _number("rainfall_mm", rainfall_mm)
    rainfall_volume = area * rain
    if not math.isfinite(rainfall_volume):
        raise ValueError("rainfall volume exceeds finite numeric range")
    runoff = rainfall_volume * coefficient
    diverted = min(runoff, area * flush * coefficient)
    after_flush = runoff - diverted
    collection_loss = after_flush * (1 - efficiency)
    return {
        "rainfall_mm": rain,
        "rainfall_volume_l": rainfall_volume,
        "gross_runoff_l": runoff,
        "first_flush_l": diverted,
        "collection_loss_l": collection_loss,
        "net_inflow_l": after_flush * efficiency,
        "first_flush_remaining_l": max(0, area * flush * coefficient - diverted),
        "assumptions": {
            "runoff_coefficient": coefficient,
            "first_flush_mm": flush,
            "first_flush_basis": "rainfall-equivalent depth converted to roof runoff volume",
            "collection_efficiency": efficiency,
            "rainfall_event_count": 1 if rain > 0 else 0,
            "unit_identity": "1 mm over 1 m² = 1 litre",
        },
        "limitations": [
            "Single-event assessment; field evidence must establish runoff coefficient and collection efficiency."
        ],
    }


def _tank_step(storage: float, inflow: float, capacity: float, demand: float) -> dict[str, float]:
    before_overflow = storage + inflow
    overflow = max(0.0, before_overflow - capacity)
    available = min(capacity, before_overflow)
    supplied = min(available, demand)
    return {
        "storage_l": max(0.0, available - supplied),
        "overflow_l": overflow,
        "water_supplied_l": supplied,
        "unmet_demand_l": max(0.0, demand - supplied),
    }


def _civil_day_hours(instant: datetime, reporting_zone: ZoneInfo) -> float:
    """Actual elapsed hours between consecutive property-local midnights."""
    local_date = instant.astimezone(reporting_zone).date()
    midnight = datetime.combine(local_date, datetime.min.time(), tzinfo=reporting_zone)
    next_midnight = datetime.combine(
        local_date + timedelta(days=1), datetime.min.time(), tzinfo=reporting_zone
    )
    hours = (next_midnight.astimezone(UTC) - midnight.astimezone(UTC)).total_seconds() / 3600
    if hours <= 0:
        raise ValueError("Reporting timezone has no positive elapsed civil-day duration")
    return hours


def simulate(
    hourly: list[dict[str, Any]],
    area_m2: float,
    runoff_coefficient: float,
    first_flush_mm: float,
    collection_efficiency: float,
    capacity_l: float,
    initial_storage_l: float,
    daily_demand_l: float,
    dry_gap_hours: int = 6,
    antecedent_state: dict[str, Any] | None = None,
    reporting_timezone: str | None = None,
) -> dict[str, Any]:
    """Consecutive one-hour water balance, with per-event diversion carryover.

    antecedent_state can be a previous final_event_state, or reliable event
    evidence with dry_hours/event_id/remaining_first_flush_l. It must represent
    the same roof parameters and end immediately before the first interval.
    Without evidence the first wet interval starts a new event, explicitly
    labelled as an assumption. Re-simulation is an estimate, not new collection.
    With reporting_timezone, demand is uniform over the actual elapsed duration
    of each property-local civil day, including 23/25-hour daylight-saving days.
    Without it, the legacy fixed daily-demand/24 rate is explicitly disclosed.
    """
    area, coefficient, flush, efficiency = _roof(
        area_m2, runoff_coefficient, first_flush_mm, collection_efficiency
    )
    reporting_zone = None
    if reporting_timezone is not None:
        if not isinstance(reporting_timezone, str) or not reporting_timezone:
            raise ValueError("reporting_timezone must be an IANA timezone name")
        try:
            reporting_zone = ZoneInfo(reporting_timezone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("reporting_timezone must be a valid IANA timezone name") from exc
    capacity = _number("capacity_l", capacity_l)
    initial = _number("initial_storage_l", initial_storage_l, maximum=capacity)
    demand_per_day = _number("daily_demand_l", daily_demand_l)
    if isinstance(dry_gap_hours, bool) or not isinstance(dry_gap_hours, int) or not 1 <= dry_gap_hours <= 168:
        raise ValueError("dry_gap_hours must be an integer from 1 to 168")
    if not isinstance(hourly, list) or not hourly:
        raise ValueError("At least one measured or forecast hourly interval is required")
    if len(hourly) > 24 * 366 * 10:
        raise ValueError("Hourly simulation is limited to ten years per request")
    parsed: list[tuple[datetime, float]] = []
    for record in hourly:
        if not isinstance(record, dict):
            raise ValueError("Hourly intervals must be objects")
        instant = _timestamp(record.get("time"))
        if parsed and instant.astimezone(UTC) - parsed[-1][0].astimezone(UTC) != timedelta(hours=1):
            raise ValueError(
                "Hourly intervals must be unique, chronological and consecutive; missing intervals cannot be treated as dry"
            )
        parsed.append((instant, _rain(record)))

    budget = area * flush * coefficient
    basis = {"area_m2": area, "runoff_coefficient": coefficient, "first_flush_mm": flush}
    dry_hours = dry_gap_hours
    counter = 0
    active_event: int | None = None
    active_start: datetime | None = None
    remaining = 0.0
    limitations = [
        "Forecast values are estimates; simulated first-flush diversion and tank changes are not observations.",
        "Rain enters before consumption in each hour; overflow may be higher than a finer-resolution model.",
        "Demand is uniform within each property-local civil day using its actual elapsed hours; occupancy schedules and additional tank losses are not modelled."
        if reporting_zone is not None
        else "No reporting timezone was supplied: demand uses the legacy fixed 24-hour rate; daylight-saving civil-day lengths are not adjusted, and occupancy schedules/additional tank losses are not modelled.",
    ]
    if antecedent_state is None:
        limitations.append(
            "Antecedent rainfall/diversion is unavailable: the first wet forecast interval is assumed to begin a new event."
        )
    else:
        if not isinstance(antecedent_state, dict):
            raise ValueError("antecedent_state must be an object")
        if "basis" in antecedent_state and antecedent_state["basis"] != basis:
            raise ValueError("Antecedent first-flush state belongs to different roof parameters")
        if "interval_end" in antecedent_state and _timestamp(
            antecedent_state["interval_end"], "antecedent interval_end"
        ).astimezone(UTC) != parsed[0][0].astimezone(UTC):
            raise ValueError("Antecedent state must end at the first interval start")
        dry_value = antecedent_state.get("dry_hours", dry_gap_hours)
        if isinstance(dry_value, bool) or not isinstance(dry_value, int) or dry_value < 0:
            raise ValueError("Antecedent dry_hours must be a nonnegative integer")
        dry_hours = min(dry_gap_hours, dry_value)
        counter_value = antecedent_state.get("event_counter", antecedent_state.get("event_id") or 0)
        if isinstance(counter_value, bool) or not isinstance(counter_value, int) or counter_value < 0:
            raise ValueError("Antecedent event_counter must be a nonnegative integer")
        counter = counter_value
        event_value = antecedent_state.get("event_id")
        if event_value is not None and (
            isinstance(event_value, bool) or not isinstance(event_value, int) or event_value < 1
        ):
            raise ValueError("Antecedent event_id must be a positive integer or null")
        active_event = event_value if dry_hours < dry_gap_hours else None
        if active_event is not None:
            counter = max(counter, active_event)
            if antecedent_state.get("event_start") is not None:
                active_start = _timestamp(antecedent_state["event_start"], "antecedent event_start")
                if active_start.astimezone(UTC) > parsed[0][0].astimezone(UTC):
                    raise ValueError("Antecedent event_start cannot be in the future")
            if "remaining_first_flush_l" not in antecedent_state:
                raise ValueError("An ongoing event requires its remaining first-flush volume")
            remaining = _number(
                "remaining_first_flush_l", antecedent_state["remaining_first_flush_l"], maximum=budget
            )
        elif dry_hours < dry_gap_hours:
            raise ValueError("Wet antecedent context requires a known event_id and diversion state")

    storage = initial
    rows: list[dict[str, Any]] = []
    events: dict[int, dict[str, Any]] = {}
    days: dict[str, dict[str, Any]] = {}
    totals = {
        key: 0.0
        for key in [
            "rainfall_mm",
            "rainfall_volume_l",
            "gross_runoff_l",
            "first_flush_l",
            "collection_loss_l",
            "net_inflow_l",
            "overflow_l",
            "water_supplied_l",
            "unmet_demand_l",
            "demand_l",
        ]
    }
    for instant, rain in parsed:
        if reporting_zone is not None:
            instant = instant.astimezone(reporting_zone)
        interval_end = (instant.astimezone(UTC) + timedelta(hours=1)).astimezone(
            reporting_zone or instant.tzinfo
        )
        rainfall_volume = area * rain
        if not math.isfinite(rainfall_volume):
            raise ValueError("Rainfall volume exceeds finite numeric range")
        runoff = rainfall_volume * coefficient
        diverted = 0.0
        row_event: int | None = None
        if rain > 0:
            if active_event is None or dry_hours >= dry_gap_hours:
                counter += 1
                active_event = counter
                active_start = instant
                remaining = budget
            row_event = active_event
            if active_event not in events:
                carried = (
                    antecedent_state is not None
                    and active_event == antecedent_state.get("event_id")
                    and not events
                )
                events[active_event] = {
                    "event_id": active_event,
                    "start": (active_start or instant).isoformat(),
                    "end": interval_end.isoformat(),
                    "window_start": instant.isoformat(),
                    "start_status": "window_start_only"
                    if carried and active_start is None
                    else "modelled_start",
                    "carried_from_antecedent": carried,
                    "rainfall_mm": 0.0,
                    "gross_runoff_l": 0.0,
                    "first_flush_l": 0.0,
                    "collection_loss_l": 0.0,
                    "net_inflow_l": 0.0,
                }
            diverted = min(runoff, remaining)
            remaining = max(0.0, remaining - diverted)
            dry_hours = 0
        else:
            dry_hours = min(dry_gap_hours, dry_hours + 1)
            if dry_hours >= dry_gap_hours:
                active_event = None
                active_start = None
                remaining = 0.0
        after_flush = runoff - diverted
        collection_loss = after_flush * (1 - efficiency)
        inflow = after_flush * efficiency
        hourly_demand = demand_per_day / (
            _civil_day_hours(instant, reporting_zone) if reporting_zone is not None else 24
        )
        step = _tank_step(storage, inflow, capacity, hourly_demand)
        storage = step["storage_l"]
        row = {
            "time": instant.isoformat(),
            "interval_end": interval_end.isoformat(),
            "rainfall_mm": rain,
            "rainfall_volume_l": rainfall_volume,
            "gross_runoff_l": runoff,
            "first_flush_l": diverted,
            "collection_loss_l": collection_loss,
            "net_inflow_l": inflow,
            "demand_l": hourly_demand,
            "event_id": row_event,
            **step,
        }
        rows.append(row)
        for key in totals:
            totals[key] += row[key]
            if not math.isfinite(totals[key]):
                raise ValueError("Simulation total exceeds finite numeric range")
        day_key = instant.date().isoformat()
        if day_key not in days:
            days[day_key] = {
                "date": day_key,
                "rainfall_mm": 0.0,
                "net_inflow_l": 0.0,
                "overflow_l": 0.0,
                "water_supplied_l": 0.0,
                "unmet_demand_l": 0.0,
                "demand_l": 0.0,
                "storage_l": storage,
                "hours": 0,
            }
        day = days[day_key]
        for key in [
            "rainfall_mm",
            "net_inflow_l",
            "overflow_l",
            "water_supplied_l",
            "unmet_demand_l",
            "demand_l",
        ]:
            day[key] += row[key]
        day["storage_l"] = storage
        day["hours"] += 1
        if row_event is not None:
            event = events[row_event]
            event["end"] = row["interval_end"]
            for key in [
                "rainfall_mm",
                "gross_runoff_l",
                "first_flush_l",
                "collection_loss_l",
                "net_inflow_l",
            ]:
                event[key] += row[key]

    balance_error = (
        initial + totals["net_inflow_l"] - storage - totals["overflow_l"] - totals["water_supplied_l"]
    )
    return {
        **totals,
        "initial_storage_l": initial,
        "final_storage_l": storage,
        "capacity_l": capacity,
        "balance_error_l": balance_error,
        "events": list(events.values()),
        "hourly": rows,
        "daily": list(days.values()),
        "available_capacity_l": capacity - storage,
        "demand_coverage_fraction": totals["water_supplied_l"] / totals["demand_l"]
        if totals["demand_l"]
        else None,
        "final_event_state": {
            "event_id": active_event,
            "event_counter": counter,
            "dry_hours": dry_hours,
            "event_start": active_start.isoformat() if active_start is not None else None,
            "remaining_first_flush_l": remaining,
            "interval_end": rows[-1]["interval_end"],
            "basis": basis,
            "status": "model_estimate",
        },
        "assumptions": {
            **basis,
            "collection_efficiency": efficiency,
            "dry_gap_hours": dry_gap_hours,
            "first_flush_basis": "rainfall-equivalent depth converted to roof runoff volume",
            "interval_timestamp": "start",
            "interval_duration_hours": 1,
            "water_balance_order": "capture, overflow, demand",
            "daily_demand_l": demand_per_day,
            "antecedent_state_provided": antecedent_state is not None,
            "reporting_timezone": reporting_timezone,
            "demand_allocation": "uniform elapsed-time rate within each local civil day"
            if reporting_zone is not None
            else "fixed daily demand / 24 hourly rate (legacy)",
        },
        "limitations": limitations,
    }


def _daily_series(daily: list[dict[str, Any]]) -> list[tuple[date, float]]:
    if not isinstance(daily, list) or not daily:
        raise ValueError("Real historical daily rainfall is required for storage optimisation")
    if len(daily) > 366 * 50:
        raise ValueError("Historical simulation is limited to fifty years per request")
    result: list[tuple[date, float]] = []
    for record in daily:
        if not isinstance(record, dict):
            raise ValueError("Historical days must be objects")
        try:
            day = date.fromisoformat(str(record["date"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("Each historical day requires an ISO date") from exc
        if result and day - result[-1][0] != timedelta(days=1):
            raise ValueError(
                "Historical days must be unique, consecutive and complete; missing days cannot be treated as dry"
            )
        result.append((day, _rain(record)))
    return result


def optimise(
    daily: list[dict[str, Any]],
    capacities_l: list[float],
    area_m2: float,
    runoff_coefficient: float,
    first_flush_mm: float,
    collection_efficiency: float,
    daily_demand_l: float,
    initial_storage_l: float = 0,
    cost_per_l_inr: float | None = None,
    available_space_m2: float | None = None,
) -> dict[str, Any]:
    """Compare candidates on a daily balance; no invented hourly rainfall.

    First flush applies once per wet historical day, a declared approximation.
    The capacity range reaches 90–95% of maximum water supplied among candidates;
    this is a transparent planning heuristic, not a cost/structural optimum.
    """
    area, coefficient, flush, efficiency = _roof(
        area_m2, runoff_coefficient, first_flush_mm, collection_efficiency
    )
    demand = _number("daily_demand_l", daily_demand_l)
    initial = _number("initial_storage_l", initial_storage_l)
    if not isinstance(capacities_l, list) or not capacities_l or len(capacities_l) > 30:
        raise ValueError("Provide one to thirty tank capacities")
    capacities = sorted({_number("capacity_l", capacity) for capacity in capacities_l})
    if initial > capacities[0]:
        raise ValueError("Initial storage must fit every candidate capacity for a fair comparison")
    cost = None if cost_per_l_inr is None else _number("cost_per_l_inr", cost_per_l_inr)
    if available_space_m2 is not None:
        _number("available_space_m2", available_space_m2)
    series = _daily_series(daily)
    comparisons: list[dict[str, Any]] = []
    total_rain = sum(rain for _, rain in series)
    for capacity in capacities:
        storage = initial
        totals = {
            key: 0.0
            for key in [
                "rainfall_mm",
                "rainfall_volume_l",
                "gross_runoff_l",
                "first_flush_l",
                "collection_loss_l",
                "net_inflow_l",
                "overflow_l",
                "water_supplied_l",
                "unmet_demand_l",
                "demand_l",
            ]
        }
        rows: list[dict[str, Any]] = []
        for day, rain in series:
            breakdown = calculate(area, rain, coefficient, flush, efficiency)
            step = _tank_step(storage, breakdown["net_inflow_l"], capacity, demand)
            storage = step["storage_l"]
            row = {
                "date": day.isoformat(),
                **{
                    key: breakdown[key]
                    for key in [
                        "rainfall_mm",
                        "rainfall_volume_l",
                        "gross_runoff_l",
                        "first_flush_l",
                        "collection_loss_l",
                        "net_inflow_l",
                    ]
                },
                "demand_l": demand,
                **step,
            }
            rows.append(row)
            for key in totals:
                totals[key] += row[key]
                if not math.isfinite(totals[key]):
                    raise ValueError("Historical simulation total exceeds finite numeric range")
        simulation = {
            **totals,
            "initial_storage_l": initial,
            "final_storage_l": storage,
            "capacity_l": capacity,
            "balance_error_l": initial
            + totals["net_inflow_l"]
            - storage
            - totals["overflow_l"]
            - totals["water_supplied_l"],
            "daily": rows,
            "hourly": [],
            "events": [],
            "timestep": "daily",
            "storage_utilisation_fraction": sum(row["storage_l"] for row in rows) / (capacity * len(rows))
            if capacity
            else 0,
            "demand_coverage_fraction": totals["water_supplied_l"] / totals["demand_l"]
            if totals["demand_l"]
            else None,
            "captured_water_l": totals["net_inflow_l"] - totals["overflow_l"],
        }
        comparisons.append(
            {
                "capacity_l": capacity,
                "cost_inr": capacity * cost if cost is not None else None,
                "simulation": simulation,
            }
        )

    maximum_supplied = max(item["simulation"]["water_supplied_l"] for item in comparisons)
    recommended: list[float] = []
    reasons: list[str] = []
    if maximum_supplied > 0 and total_rain > 0 and demand > 0:
        lower = next(
            item["capacity_l"]
            for item in comparisons
            if item["simulation"]["water_supplied_l"] >= maximum_supplied * 0.9
        )
        upper = next(
            item["capacity_l"]
            for item in comparisons
            if item["simulation"]["water_supplied_l"] >= maximum_supplied * 0.95
        )
        recommended = [lower, upper]
        reasons.append(
            "Range selects the smallest tested capacities reaching 90% and 95% of maximum simulated water supplied among the submitted candidates."
        )
        reasons.append(
            "Compare additional supply and avoided overflow against incremental installed cost; the largest tank is not preferred automatically."
        )
    else:
        reasons.append(
            "The supplied period and demand show no rainwater-supply benefit; a useful storage capacity range cannot be established."
        )
    limitations = [
        "Daily historical rainfall cannot identify hourly storms or dry gaps: first flush is approximated once per wet day.",
        "All daily inflow is captured before daily demand; overflow and useful supply may differ under actual within-day timing.",
        "The submitted historical period may not represent long-term climate; the result is a planning scenario, not a guaranteed yield.",
        "The 90–95% target is an explicit candidate-relative heuristic, not an engineering standard or an economic optimum.",
        "Tank installation requires actual dimensions, access and structural assessment; available area alone cannot verify fit.",
        "Evaporation, leakage, maintenance downtime, pumping energy and water-quality treatment are not included.",
    ]
    if cost is None:
        limitations.append(
            "No cost was supplied; prices, payback and financial savings have not been estimated."
        )
    else:
        limitations.append(
            "Cost is the user-supplied linear INR-per-litre assumption; foundations, pipework and operating costs may be additional."
        )
    return {
        "comparisons": comparisons,
        "recommended_range_l": recommended,
        "reasons": reasons,
        "objective": {
            "metric": "water_supplied_l",
            "lower_target_fraction": 0.9,
            "upper_target_fraction": 0.95,
            "maximum_candidate_supply_l": maximum_supplied,
        },
        "coverage": {
            "start_date": series[0][0].isoformat(),
            "end_date": series[-1][0].isoformat(),
            "days": len(series),
        },
        "assumptions": {
            "initial_storage_l": initial,
            "first_flush_mm": flush,
            "first_flush_frequency": "once per wet day (approximation)",
            "runoff_coefficient": coefficient,
            "collection_efficiency": efficiency,
            "daily_demand_l": demand,
            "cost_per_l_inr": cost,
            "available_space_m2": available_space_m2,
        },
        "limitations": limitations,
    }
