"""Exact multiple-choice knapsack over independently modelled storage quotations."""
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal


def paisa(value):
    return int((Decimal(str(value)) * 100).to_integral_value(rounding=ROUND_HALF_UP))


def select_investments(options, budget_inr):
    """At most one replacement tank per property; maximise incremental supplied L.

    Exact Pareto-frontier dynamic programming avoids an unnecessary solver
    dependency for the bounded pilot. No greedy benefit/cost assumption.
    """
    budget = paisa(budget_inr)
    groups = defaultdict(list)
    for option in options:
        if option["period_benefit_l"] > 0 and paisa(option["cost_inr"]) <= budget:
            groups[option["property_id"]].append(option)
    frontier = {0: (0.0, [])}
    for property_id in sorted(groups):
        candidates = dict(frontier)
        for cost, (benefit, selected) in frontier.items():
            for option in groups[property_id]:
                next_cost = cost + paisa(option["cost_inr"])
                next_benefit = benefit + option["period_benefit_l"]
                if next_cost <= budget and next_benefit > candidates.get(next_cost, (-1, []))[0]:
                    candidates[next_cost] = (next_benefit, [*selected, option])
        frontier = {}
        maximum = -1
        for cost, candidate in sorted(candidates.items()):
            if candidate[0] > maximum:
                frontier[cost] = candidate
                maximum = candidate[0]
        if len(frontier) > 50000:
            raise ValueError("Too many nondominated budget combinations; reduce the quotation set")
    cost, (benefit, selected) = max(frontier.items(), key=lambda item: (item[1][0], -item[0]))
    return {
        "selected": selected,
        "total_cost_inr": cost / 100,
        "period_benefit_l": benefit,
        "budget_remaining_inr": (budget - cost) / 100,
        "method": "Exact Pareto-frontier multiple-choice knapsack; maximum additional supplied water, one upgrade per property",
    }
