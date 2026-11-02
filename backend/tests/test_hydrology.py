"""Synthetic rainfall exists only in these automated scientific tests."""

import math
import random
from datetime import UTC, datetime, timedelta

import pytest

from app.services.hydrology import calculate, optimise, simulate


def hourly(rain, start="2026-07-01T00:00:00+05:30"):
    instant = datetime.fromisoformat(start)
    return [
        {"time": (instant + timedelta(hours=index)).isoformat(), "precipitation_mm": amount}
        for index, amount in enumerate(rain)
    ]


def run(rain, **changes):
    args = dict(
        area_m2=100,
        runoff_coefficient=0.8,
        first_flush_mm=1,
        collection_efficiency=0.9,
        capacity_l=1000,
        initial_storage_l=0,
        daily_demand_l=0,
    )
    args.update(changes)
    return simulate(hourly(rain), **args)


def test_unit_identity_and_losses_applied_once():
    result = calculate(100, 10, 0.8, 1, 0.9)
    assert result["rainfall_volume_l"] == 1000
    assert result["gross_runoff_l"] == 800
    assert result["first_flush_l"] == 80
    assert result["collection_loss_l"] == pytest.approx(72)
    assert result["net_inflow_l"] == pytest.approx(648)
    assert result["gross_runoff_l"] == pytest.approx(
        sum(result[key] for key in ["first_flush_l", "collection_loss_l", "net_inflow_l"])
    )


def test_small_event_never_yields_negative_collection():
    result = calculate(100, 0.2, 0.8, 1, 0.9)
    assert result["first_flush_l"] == 16
    assert result["first_flush_remaining_l"] == 64
    assert result["net_inflow_l"] == 0
    assert result["collection_loss_l"] == 0


def test_extreme_numeric_values_raise_validation_errors():
    with pytest.raises(ValueError):
        calculate(10**1000, 1, 0.8, 1, 0.9)
    with pytest.raises(ValueError):
        calculate(1e308, 10, 0.8, 1, 0.9)


def test_zero_rain_and_zero_coefficient():
    assert calculate(100, 0, 0.8, 1, 0.9)["net_inflow_l"] == 0
    assert calculate(100, 10, 0, 1, 0.9)["gross_runoff_l"] == 0


@pytest.mark.parametrize(
    "field,value",
    [
        ("area_m2", 0),
        ("rainfall_mm", -1),
        ("runoff_coefficient", 1.1),
        ("collection_efficiency", -0.1),
        ("first_flush_mm", -1),
        ("area_m2", math.nan),
        ("rainfall_mm", math.inf),
        ("runoff_coefficient", True),
        ("rainfall_mm", "1"),
    ],
)
def test_calculator_rejects_invalid_physical_inputs(field, value):
    args = dict(
        area_m2=100, rainfall_mm=10, runoff_coefficient=0.8, first_flush_mm=1, collection_efficiency=0.9
    )
    args[field] = value
    with pytest.raises(ValueError):
        calculate(**args)


def test_first_flush_once_during_consecutive_wet_hours():
    result = run([0.25, 0.25, 0.5, 1], collection_efficiency=1)
    assert [row["first_flush_l"] for row in result["hourly"]] == [20, 20, 40, 0]
    assert result["first_flush_l"] == 80
    assert result["net_inflow_l"] == 80
    assert len(result["events"]) == 1


def test_five_dry_hours_do_not_start_new_event():
    result = run([5, 0, 0, 0, 0, 0, 5])
    assert len(result["events"]) == 1
    assert result["first_flush_l"] == 80


def test_six_dry_hours_start_second_event():
    result = run([5, 0, 0, 0, 0, 0, 0, 5])
    assert len(result["events"]) == 2
    assert result["first_flush_l"] == 160
    assert result["events"][0]["event_id"] != result["events"][1]["event_id"]


def test_midnight_never_resets_rain_event():
    result = simulate(hourly([5, 5], "2026-07-01T23:00:00+05:30"), 100, 0.8, 1, 1, 1000, 0, 0)
    assert result["first_flush_l"] == 80
    assert len(result["events"]) == 1
    assert [row["date"] for row in result["daily"]] == ["2026-07-01", "2026-07-02"]


def test_carryover_preserves_partly_diverted_event():
    first = run([0.25], collection_efficiency=1)
    second = simulate(
        hourly([0.75, 1], "2026-07-01T01:00:00+05:30"),
        100,
        0.8,
        1,
        1,
        1000,
        first["final_storage_l"],
        0,
        antecedent_state=first["final_event_state"],
    )
    assert first["first_flush_l"] + second["first_flush_l"] == 80
    assert second["net_inflow_l"] == 80
    assert second["events"][0]["carried_from_antecedent"] is True
    assert second["events"][0]["event_id"] == first["events"][0]["event_id"]
    assert second["events"][0]["start"] == first["events"][0]["start"]
    assert second["events"][0]["window_start"] == "2026-07-01T01:00:00+05:30"


def test_carryover_does_not_reset_completed_flush():
    first = run([2], collection_efficiency=1)
    second = simulate(
        hourly([2], "2026-07-01T01:00:00+05:30"),
        100,
        0.8,
        1,
        1,
        1000,
        first["final_storage_l"],
        0,
        antecedent_state=first["final_event_state"],
    )
    assert second["first_flush_l"] == 0
    assert second["net_inflow_l"] == 160


def test_dry_gap_discards_old_remaining_budget_and_starts_fresh_event():
    first = run([0.25, 0, 0, 0, 0, 0, 0], collection_efficiency=1)
    assert first["final_event_state"]["event_id"] is None
    assert first["final_event_state"]["remaining_first_flush_l"] == 0
    second = simulate(
        hourly([1], "2026-07-01T07:00:00+05:30"),
        100,
        0.8,
        1,
        1,
        1000,
        0,
        0,
        antecedent_state=first["final_event_state"],
    )
    assert second["first_flush_l"] == 80
    assert second["events"][0]["event_id"] == 2
    assert second["events"][0]["carried_from_antecedent"] is False


@pytest.mark.parametrize(
    "state",
    [
        {"dry_hours": 0},
        {"dry_hours": -1},
        {"dry_hours": 0, "event_id": 1},
        {"dry_hours": 0, "event_id": 1, "remaining_first_flush_l": 81},
        {"dry_hours": 6, "interval_end": "2026-06-30T20:00:00+05:30"},
        {"basis": {"area_m2": 200}},
    ],
)
def test_invalid_antecedent_state_is_rejected(state):
    with pytest.raises(ValueError):
        run([1], antecedent_state=state)


def test_no_antecedent_is_explicitly_disclosed():
    assert any("Antecedent" in message for message in run([1])["limitations"])


def test_tank_capture_overflow_then_limited_demand():
    result = run(
        [10],
        first_flush_mm=0,
        collection_efficiency=1,
        capacity_l=500,
        initial_storage_l=400,
        daily_demand_l=2400,
    )
    assert result["net_inflow_l"] == 800
    assert result["overflow_l"] == 700
    assert result["water_supplied_l"] == 100
    assert result["final_storage_l"] == 400
    assert result["balance_error_l"] == pytest.approx(0)


def test_empty_tank_tracks_unmet_demand():
    result = run([0, 0], daily_demand_l=240)
    assert result["water_supplied_l"] == 0
    assert result["unmet_demand_l"] == 20
    assert result["final_storage_l"] == 0


def test_zero_capacity_overflows_every_inflow():
    result = run([2], first_flush_mm=0, collection_efficiency=1, capacity_l=0)
    assert result["overflow_l"] == result["net_inflow_l"]
    assert result["final_storage_l"] == 0


def test_full_dry_day_consumes_daily_demand_once():
    result = run([0] * 24, initial_storage_l=600, daily_demand_l=240)
    assert result["water_supplied_l"] == pytest.approx(240)
    assert result["final_storage_l"] == pytest.approx(360)
    assert result["daily"][0]["hours"] == 24


def test_probability_does_not_scale_rainfall_amount():
    records = hourly([10])
    records[0]["probability_pct"] = 10
    result = simulate(records, 100, 0.8, 0, 1, 1000, 0, 0)
    assert result["gross_runoff_l"] == 800


def test_missing_precipitation_is_not_interpreted_as_zero():
    records = hourly([1])
    del records[0]["precipitation_mm"]
    with pytest.raises(ValueError):
        simulate(records, 100, 0.8, 0, 1, 1000, 0, 0)


@pytest.mark.parametrize(
    "records",
    [
        hourly([1])[::-1] + hourly([1]),
        [hourly([1])[0], hourly([1], "2026-07-01T02:00:00+05:30")[0]],
        [hourly([1], "2026-07-01T01:00:00+05:30")[0], hourly([1])[0]],
        [{"time": "2026-07-01T00:00:00", "precipitation_mm": 1}],
        [],
    ],
)
def test_hourly_timeline_requires_aware_unique_consecutive_data(records):
    with pytest.raises(ValueError):
        simulate(records, 100, 0.8, 0, 1, 1000, 0, 0)


def test_timezone_offsets_compare_absolute_intervals():
    records = [
        {"time": "2026-07-01T05:30:00+05:30", "precipitation_mm": 1},
        {"time": "2026-07-01T01:00:00+00:00", "precipitation_mm": 1},
    ]
    result = simulate(records, 100, 0.8, 0, 1, 1000, 0, 0)
    assert result["gross_runoff_l"] == 160


@pytest.mark.parametrize(
    "change",
    [
        {"initial_storage_l": 1001},
        {"capacity_l": -1},
        {"daily_demand_l": math.nan},
        {"dry_gap_hours": 0},
        {"dry_gap_hours": 1.5},
    ],
)
def test_invalid_tank_parameters_rejected(change):
    with pytest.raises(ValueError):
        run([1], **change)


def test_random_synthetic_balances_preserve_mass_and_physical_limits():
    generator = random.Random(73)
    for _ in range(20):
        rain = [generator.uniform(0, 20) if generator.random() < 0.25 else 0 for _ in range(240)]
        capacity = generator.uniform(100, 10_000)
        initial = generator.uniform(0, capacity)
        result = run(
            rain, capacity_l=capacity, initial_storage_l=initial, daily_demand_l=generator.uniform(0, 1500)
        )
        assert abs(result["balance_error_l"]) < 1e-7
        assert result["gross_runoff_l"] == pytest.approx(
            result["first_flush_l"] + result["collection_loss_l"] + result["net_inflow_l"]
        )
        for row in result["hourly"]:
            assert 0 <= row["storage_l"] <= capacity
            assert row["overflow_l"] >= 0
            assert row["water_supplied_l"] + row["unmet_demand_l"] == pytest.approx(row["demand_l"])


def daily(rain):
    start = datetime(2026, 7, 1, tzinfo=UTC)
    return [
        {"date": (start + timedelta(days=index)).date().isoformat(), "precipitation_mm": amount}
        for index, amount in enumerate(rain)
    ]


def sizing(rain, capacities=(100, 500, 1000), **change):
    args = dict(
        area_m2=100, runoff_coefficient=1, first_flush_mm=0, collection_efficiency=1, daily_demand_l=100
    )
    args.update(change)
    return optimise(daily(rain), list(capacities), **args)


def test_sizing_prefers_small_capacity_when_extra_storage_adds_no_supply():
    result = sizing([10, 10, 10])
    assert result["recommended_range_l"] == [100, 100]
    assert result["comparisons"][0]["simulation"]["water_supplied_l"] == 300


def test_sizing_exposes_overflow_supply_and_unmet_demand_tradeoff():
    result = sizing([10, 0, 0, 0])
    smaller, medium, larger = result["comparisons"]
    assert smaller["simulation"]["water_supplied_l"] == 100
    assert medium["simulation"]["water_supplied_l"] == 400
    assert larger["simulation"]["water_supplied_l"] == 400
    assert result["recommended_range_l"] == [500, 500]
    for comparison in result["comparisons"]:
        simulation = comparison["simulation"]
        assert simulation["balance_error_l"] == pytest.approx(0)
        assert simulation["water_supplied_l"] + simulation["unmet_demand_l"] == 400


def test_daily_first_flush_approximation_is_explicit_and_not_fake_hourly_data():
    result = sizing([0.5, 0.5], first_flush_mm=1)
    simulation = result["comparisons"][0]["simulation"]
    assert simulation["first_flush_l"] == 100
    assert simulation["hourly"] == []
    assert simulation["events"] == []
    assert any("once per wet day" in limitation for limitation in result["limitations"])


def test_cost_and_space_are_user_assumptions_not_verified_installation():
    result = sizing([10, 0], cost_per_l_inr=12, available_space_m2=2)
    assert result["comparisons"][0]["cost_inr"] == 1200
    assert any("structural assessment" in limitation for limitation in result["limitations"])


@pytest.mark.parametrize("rain,change", [([0, 0], {}), ([10], {"daily_demand_l": 0})])
def test_no_supply_benefit_returns_no_capacity_recommendation(rain, change):
    assert sizing(rain, **change)["recommended_range_l"] == []


def test_sizing_rejects_missing_days_and_inconsistent_initial_storage():
    with pytest.raises(ValueError):
        optimise([daily([1, 1, 1])[0], daily([1, 1, 1])[2]], [100], 100, 1, 0, 1, 100)
    with pytest.raises(ValueError):
        sizing([1], capacities=(100, 1000), initial_storage_l=101)


@pytest.mark.parametrize("capacities", [[], [-1], [math.inf], [True]])
def test_sizing_rejects_invalid_capacities(capacities):
    with pytest.raises(ValueError):
        sizing([1], capacities=capacities)


def civil_day_records(day, zone_name="America/New_York"):
    """Fixture interval starts advance in UTC, including skipped/repeated hours."""
    from datetime import UTC
    from zoneinfo import ZoneInfo

    zone = ZoneInfo(zone_name)
    start = datetime.fromisoformat(day).replace(tzinfo=zone)
    end = (start.replace(tzinfo=None) + timedelta(days=1)).replace(tzinfo=zone)
    start_utc = start.astimezone(UTC)
    hours = int((end.astimezone(UTC) - start_utc).total_seconds() / 3600)
    return [
        {
            "time": (start_utc + timedelta(hours=index)).isoformat(),
            "precipitation_mm": 0,
        }
        for index in range(hours)
    ]


def civil_day_run(records, **changes):
    parameters = dict(
        area_m2=100,
        runoff_coefficient=0.8,
        first_flush_mm=1,
        collection_efficiency=1,
        capacity_l=2000,
        initial_storage_l=1000,
        daily_demand_l=240,
        reporting_timezone="America/New_York",
    )
    parameters.update(changes)
    return simulate(records, **parameters)


def test_spring_forward_full_civil_day_consumes_one_daily_demand():
    result = civil_day_run(civil_day_records("2026-03-08"))
    assert len(result["hourly"]) == 23
    assert result["demand_l"] == pytest.approx(240)
    assert result["water_supplied_l"] == pytest.approx(240)
    assert result["final_storage_l"] == pytest.approx(760)
    assert result["daily"][0]["date"] == "2026-03-08"
    assert result["daily"][0]["hours"] == 23
    assert result["hourly"][1]["time"] == "2026-03-08T01:00:00-05:00"
    assert result["hourly"][1]["interval_end"] == "2026-03-08T03:00:00-04:00"
    assert result["balance_error_l"] == pytest.approx(0, abs=1e-8)


def test_fall_back_full_civil_day_consumes_one_daily_demand():
    result = civil_day_run(civil_day_records("2026-11-01"))
    assert len(result["hourly"]) == 25
    assert result["demand_l"] == pytest.approx(240)
    assert result["water_supplied_l"] == pytest.approx(240)
    assert result["daily"][0]["date"] == "2026-11-01"
    assert result["daily"][0]["hours"] == 25
    assert result["hourly"][1]["time"] == "2026-11-01T01:00:00-04:00"
    assert result["hourly"][1]["interval_end"] == "2026-11-01T01:00:00-05:00"
    assert result["hourly"][2]["time"] == "2026-11-01T01:00:00-05:00"
    assert result["final_storage_l"] == pytest.approx(760)


def test_partial_spring_day_forecast_consumes_only_remaining_window_hours():
    result = civil_day_run(civil_day_records("2026-03-08")[2:8])
    assert result["daily"][0]["hours"] == 6
    assert result["demand_l"] == pytest.approx(240 * 6 / 23)
    assert result["final_storage_l"] == pytest.approx(1000 - 240 * 6 / 23)


def test_partial_fall_day_forecast_uses_twenty_five_hour_density():
    result = civil_day_run(civil_day_records("2026-11-01")[1:7])
    assert result["demand_l"] == pytest.approx(240 * 6 / 25)
    assert result["daily"][0]["date"] == "2026-11-01"


def test_daily_bins_keep_property_local_dates_at_dst_midnight():
    records = civil_day_records("2026-03-07")[-3:] + civil_day_records("2026-03-08")[:4]
    result = civil_day_run(records)
    assert [day["date"] for day in result["daily"]] == ["2026-03-07", "2026-03-08"]
    assert result["daily"][0]["demand_l"] == pytest.approx(240 * 3 / 24)
    assert result["daily"][1]["demand_l"] == pytest.approx(240 * 4 / 23)
    assert result["demand_l"] == pytest.approx(240 * (3 / 24 + 4 / 23))


def test_rain_event_remains_one_event_across_fall_back_repeated_hour():
    records = civil_day_records("2026-11-01")[1:3]
    records[0]["precipitation_mm"] = 1
    records[1]["precipitation_mm"] = 1
    result = civil_day_run(records, daily_demand_l=0)
    assert len(result["events"]) == 1
    assert result["first_flush_l"] == 80
    assert result["net_inflow_l"] == 80
    assert result["final_event_state"]["interval_end"] == "2026-11-01T02:00:00-05:00"


def test_default_timezone_mode_retains_legacy_hourly_rate_with_disclosure():
    result = civil_day_run(civil_day_records("2026-11-01"), reporting_timezone=None)
    assert result["demand_l"] == pytest.approx(250)
    assert any("24-hour" in message for message in result["limitations"])


def test_invalid_reporting_timezone_is_rejected():
    with pytest.raises(ValueError, match="timezone"):
        civil_day_run(civil_day_records("2026-03-08"), reporting_timezone="Mars/Olympus")


def test_mumbai_full_civil_day_preserves_pilot_demand_and_dates():
    result = civil_day_run(
        civil_day_records("2026-07-01", zone_name="Asia/Kolkata"),
        reporting_timezone="Asia/Kolkata",
    )
    assert result["demand_l"] == pytest.approx(240)
    assert result["daily"][0]["date"] == "2026-07-01"
    assert result["daily"][0]["hours"] == 24
    assert result["hourly"][0]["time"] == "2026-07-01T00:00:00+05:30"
