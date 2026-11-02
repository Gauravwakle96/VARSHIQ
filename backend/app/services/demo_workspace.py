"""Explicitly fictional feature previews. No databases, accounts or field evidence."""

from calendar import monthrange
from datetime import date
from io import BytesIO
from statistics import mean
from textwrap import wrap

from reportlab.pdfgen.canvas import Canvas

from app.services.demo import demonstration
from app.services.hydrology import optimise, simulate


def workspace_demonstration(inputs):
    result = demonstration(inputs)
    calculation = result["calculation"]
    # An invented seasonal shape, not an Indian climate normal or IMD dataset.
    weights = [1, 1, 1, 2, 4, 17, 27, 23, 16, 5, 2, 1]
    monthly = [
        {"month": month, "rainfall_mm": inputs.annual_rainfall_mm * weight / sum(weights)}
        for month, weight in enumerate(weights, 1)
    ]
    daily = []
    for item in monthly:
        for day in range(1, monthrange(2001, item["month"])[1] + 1):
            daily.append(
                {
                    "date": date(2001, item["month"], day).isoformat(),
                    "precipitation_mm": item["rainfall_mm"] / 5 if day in {3, 8, 14, 19, 25} else 0,
                }
            )
    sizes = sorted({max(100, inputs.capacity_l / 2), inputs.capacity_l, min(100000, inputs.capacity_l * 2)})
    sizing = optimise(
        daily,
        sizes,
        area_m2=inputs.area_m2,
        runoff_coefficient=inputs.runoff_coefficient,
        first_flush_mm=inputs.first_flush_mm,
        collection_efficiency=inputs.collection_efficiency,
        daily_demand_l=inputs.daily_demand_l,
        initial_storage_l=0,
    )
    # Initial tank water is explicitly assumed to belong to the scenario supply.
    supply = [
        {"source": "Simulated tank supply", "volume_l": calculation["water_supplied_l"]},
        {"source": "Assumed municipal fallback", "volume_l": calculation["unmet_demand_l"]},
    ]
    consumption = [
        {"use": label, "volume_l": calculation["demand_l"] * fraction}
        for label, fraction in [
            ("Toilets", 0.45),
            ("Cleaning", 0.25),
            ("Gardening", 0.2),
            ("Other non-potable use", 0.1),
        ]
    ]
    pairs = []
    if calculation["net_inflow_l"] > 0:
        predicted = calculation["net_inflow_l"] / 3
        pairs = [
            {"sample": index, "predicted_l": predicted, "simulated_reading_l": predicted * ratio}
            for index, ratio in enumerate([0.88, 0.94, 0.82], 1)
        ]
    properties = []
    for building in result["community"]["buildings"]:
        model = simulate(
            [{"time": row["time"], "precipitation_mm": row["rainfall_mm"]} for row in calculation["hourly"]],
            area_m2=building["area_m2"],
            runoff_coefficient=inputs.runoff_coefficient,
            first_flush_mm=inputs.first_flush_mm,
            collection_efficiency=inputs.collection_efficiency,
            capacity_l=building["current_capacity_l"],
            initial_storage_l=0,
            daily_demand_l=building["daily_demand_l"],
            reporting_timezone="Asia/Kolkata",
        )
        properties.append(
            {
                **building,
                "net_inflow_l": model["net_inflow_l"],
                "overflow_l": model["overflow_l"],
                "measurement_status": "simulated_unverified",
                "registered": False,
            }
        )
    result["workspace"] = {
        "data_kind": "simulated_demonstration",
        "persisted": False,
        "supply": supply,
        "consumption": consumption,
        "historical": {
            "source": "Invented seasonal distribution",
            "year": 2001,
            "annual_rainfall_mm": inputs.annual_rainfall_mm,
            "monthly": monthly,
            "resolution": "No measured spatial resolution; synthetic example only",
        },
        "annual_sizing": sizing,
        "performance": {
            "pairs": pairs,
            "mae_l": mean(abs(item["predicted_l"] - item["simulated_reading_l"]) for item in pairs)
            if pairs
            else None,
            "calibration_eligible": False,
            "reason": "Simulated readings cannot establish actual accuracy or eligibility for site calibration.",
        },
        "properties": properties,
        "community": {
            "fictional_count": len(properties),
            "verified_area_m2": 0,
            "assumed_area_m2": sum(item["area_m2"] for item in properties),
            "capacity_l": sum(item["current_capacity_l"] for item in properties),
            "net_inflow_l": sum(item["net_inflow_l"] for item in properties),
            "overflow_l": sum(item["overflow_l"] for item in properties),
        },
        "groundwater": {
            "depth_m": None,
            "infiltration_mm_h": None,
            "suitability": "professional_assessment_required",
        },
        "limitations": [
            "Every scenario property, source volume, use allocation and performance reading is fictional; none is an actual record.",
            "Municipal fallback and stored-water origin are illustrative assumptions, not supplied-water observations.",
            "The annual seasonal shape and wet dates are invented, not retrieved climate data or local observations.",
            "Annual sizing uses the real daily-balance engine with synthetic rainfall and an empty initial tank; no quotation is supplied.",
            "No roof, water-quality, maintenance or groundwater verification is granted by this sandbox.",
        ],
    }
    return result


def demonstration_report(inputs):
    result = workspace_demonstration(inputs)
    calculation = result["calculation"]
    output = BytesIO()
    canvas = Canvas(output)
    canvas.setTitle("VARSHIQ - SIMULATED assessment")
    canvas.setFont("Helvetica-Bold", 15)
    canvas.drawString(42, 795, "VARSHIQ - SIMULATED ASSESSMENT")
    canvas.setFont("Helvetica", 10)
    lines = [
        "Fictional planning exercise. No actual property, measurement or forecast is assessed.",
        "Source: synthetic 48-hour rainfall, illustrative scenario days 1-2 (July 2000).",
        f"Catchment: {inputs.area_m2:g} m2; rainfall: {inputs.rainfall_mm:g} mm; coefficient: {inputs.runoff_coefficient:g}.",
        f"First flush: {inputs.first_flush_mm:g} mm/event; collection efficiency: {inputs.collection_efficiency:g}.",
        f"Tank: {inputs.capacity_l:g} L; assumed starting storage: {calculation['initial_storage_l']:g} L.",
        f"Demand: {inputs.daily_demand_l:g} L/day; annual rainfall example: {inputs.annual_rainfall_mm:g} mm.",
        f"Gross runoff: {calculation['gross_runoff_l']:.2f} L; first flush: {calculation['first_flush_l']:.2f} L.",
        f"Conveyance/filter loss: {calculation['collection_loss_l']:.2f} L; net inflow: {calculation['net_inflow_l']:.2f} L.",
        f"Supplied demand: {calculation['water_supplied_l']:.2f} L; overflow: {calculation['overflow_l']:.2f} L.",
        f"Ending storage: {calculation['final_storage_l']:.2f} L; balance residual: {calculation['balance_error_l']:.6f} L.",
        *result["assumptions"],
        *result["workspace"]["limitations"],
        "Water quality and recharge suitability remain unestablished. Professional site assessment is required.",
    ]
    y = 768
    for line in lines:
        for fragment in wrap(line, width=94):
            if y < 55:
                canvas.showPage()
                canvas.setFont("Helvetica", 10)
                y = 790
            canvas.drawString(42, y, fragment)
            y -= 15
        y -= 5
    canvas.save()
    return output.getvalue()
