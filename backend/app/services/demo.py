"""User-authorised illustrative scenarios. No database, observations or providers.

Demo inputs intentionally differ from operational records. The physical model
and investment solver are the same deterministic services used by WaterTwin.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.services.community import select_investments
from app.services.hydrology import simulate


def synthetic_rainfall(rainfall_mm, weather):
    weights = [0.0] * 48
    if weather == "steady":
        weights[4:28] = [1.0] * 24
    elif weather == "bursts":
        weights[2:10] = [1, 2, 3, 6, 9, 8, 5, 2]
        weights[27:33] = [1, 2, 4, 4, 2, 1]
    total = sum(weights)
    # Fixed, explicitly illustrative time anchor: never a retrieved forecast.
    start = datetime(2000, 7, 1, tzinfo=ZoneInfo("Asia/Kolkata"))
    return [
        {
            "time": (start + timedelta(hours=index)).isoformat(),
            "precipitation_mm": rainfall_mm * weight / total if total else 0.0,
        }
        for index, weight in enumerate(weights)
    ]


def demonstration(inputs):
    hours = synthetic_rainfall(inputs.rainfall_mm, inputs.weather)
    roof = {
        "area_m2": inputs.area_m2,
        "runoff_coefficient": inputs.runoff_coefficient,
        "first_flush_mm": inputs.first_flush_mm,
        "collection_efficiency": inputs.collection_efficiency,
    }

    def model(capacity, demand, initial=0, area=None):
        return simulate(
            hours,
            **{**roof, "area_m2": area if area is not None else inputs.area_m2},
            capacity_l=capacity,
            initial_storage_l=initial,
            daily_demand_l=demand,
            reporting_timezone="Asia/Kolkata",
            dry_gap_hours=6,
        )

    calculation = model(
        inputs.capacity_l, inputs.daily_demand_l, inputs.capacity_l * inputs.initial_storage_pct / 100
    )
    capacities = sorted(
        {max(100, inputs.capacity_l / 2), inputs.capacity_l, min(100000, inputs.capacity_l * 2)}
    )
    comparisons = []
    for capacity in capacities:
        result = model(capacity, inputs.daily_demand_l)
        comparisons.append(
            {
                "capacity_l": capacity,
                "water_supplied_l": result["water_supplied_l"],
                "overflow_l": result["overflow_l"],
                "final_storage_l": result["final_storage_l"],
                "unmet_demand_l": result["unmet_demand_l"],
            }
        )

    # Fictional buildings and indicative costs, never real registrations/quotes.
    sites = [
        ("demo-home", "Demo home", 120, 300, 100, [(800, 7000), (1600, 14000)]),
        ("demo-office", "Demo office", 1000, 2500, 500, [(3000, 25000), (6000, 45000)]),
        ("demo-society", "Demo society", 2000, 5000, 1000, [(5000, 40000), (10000, 70000)]),
    ]
    options, buildings = [], []
    for identifier, name, area, demand, current, candidates in sites:
        baseline = model(current, demand, area=area)
        buildings.append(
            {
                "id": identifier,
                "name": name,
                "area_m2": area,
                "daily_demand_l": demand,
                "current_capacity_l": current,
            }
        )
        for capacity, cost in candidates:
            upgrade = model(capacity, demand, area=area)
            options.append(
                {
                    "property_id": identifier,
                    "property_name": name,
                    "capacity_l": capacity,
                    "cost_inr": cost,
                    "period_benefit_l": max(0, upgrade["water_supplied_l"] - baseline["water_supplied_l"]),
                    "avoided_overflow_l": baseline["overflow_l"] - upgrade["overflow_l"],
                    "reason": "Additional water supplied versus this fictional building's existing tank, under the same synthetic rainfall and demand.",
                }
            )
    investment = select_investments(options, inputs.budget_inr)
    return {
        "data_kind": "simulated_demonstration",
        "persisted": False,
        "rainfall_source": "Synthetic 48-hour scenario; no live forecast or historical observation",
        "inputs": inputs.model_dump(),
        "calculation": calculation,
        "storage_comparisons": comparisons,
        "community": {**investment, "buildings": buildings, "alternatives": options},
        "assumptions": [
            "Water-scenario profiles, community buildings, rainfall, readings and costs are illustrative; selected OSM outlines are separate public geography, not verified catchments.",
            "Rainfall timestamps use a fixed illustrative anchor and are displayed as scenario days/hours.",
            "First flush is rainfall-equivalent depth × area × coefficient, once per event after a six-hour dry gap.",
            "Collection efficiency applies once after diversion; hourly capture and overflow precede uniform demand.",
            "Storage alternatives and community upgrades start empty for a consistent comparison.",
            "Community selection maximises additional water supplied over these 48 hours; one upgrade per fictional building.",
            "Sample costs are indicative scenario inputs, not quotations. No annual savings, potable-water or engineering certification is inferred.",
            "This short scenario illustrates behaviour; operational tank sizing needs appropriate historical rainfall, measurements, costs and site constraints.",
        ],
    }
