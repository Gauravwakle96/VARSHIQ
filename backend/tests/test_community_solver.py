"""Synthetic quotations exercise exact budget selection; no production records."""

import copy
import itertools
import random
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

import pytest
from pydantic import ValidationError

from app.operations_schemas import Investment
from app.services.community import paisa, select_investments


def quotation(property_id, cost_inr, benefit_l, capacity_l=1000):
    return {
        "property_id": property_id,
        "capacity_l": capacity_l,
        "cost_inr": cost_inr,
        "period_benefit_l": benefit_l,
        "quote_source": "Synthetic automated-test quotation",
        "installation_space_confirmed": True,
    }


def reference_paisa(value):
    """Independent cent normalisation, including accepted binary-float noise."""
    return int(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) * 100)


def brute_force_objective(options, budget_inr):
    """Enumerate every legal one-or-none choice, independent of frontier pruning."""
    groups = defaultdict(list)
    for option in options:
        groups[option["property_id"]].append(option)
    choices = [[None, *groups[property_id]] for property_id in sorted(groups)]
    budget = reference_paisa(budget_inr)
    best_benefit, cheapest_cost = 0, 0
    for combination in itertools.product(*choices):
        selected = [option for option in combination if option is not None]
        cost = sum(reference_paisa(option["cost_inr"]) for option in selected)
        benefit = sum(option["period_benefit_l"] for option in selected)
        if cost <= budget and (benefit > best_benefit or (benefit == best_benefit and cost < cheapest_cost)):
            best_benefit, cheapest_cost = benefit, cost
    return best_benefit, cheapest_cost


def assert_legal(result, budget_inr):
    selected = result["selected"]
    assert len({option["property_id"] for option in selected}) == len(selected)
    spent = sum(reference_paisa(option["cost_inr"]) for option in selected)
    assert spent <= reference_paisa(budget_inr)
    assert result["total_cost_inr"] == pytest.approx(spent / 100)
    assert result["budget_remaining_inr"] == pytest.approx((reference_paisa(budget_inr) - spent) / 100)
    assert result["period_benefit_l"] == pytest.approx(sum(option["period_benefit_l"] for option in selected))


@pytest.mark.parametrize("seed", range(16))
def test_frontier_solver_matches_exhaustive_choices_over_many_budgets(seed):
    generator = random.Random(seed)
    options = []
    for property_index in range(generator.randint(1, 5)):
        for option_index in range(generator.randint(1, 3)):
            options.append(
                quotation(
                    f"property-{property_index}",
                    generator.randint(1, 100) / 100,
                    generator.randint(0, 50),
                    capacity_l=1000 * (option_index + 1),
                )
            )
    for budget_paisa in range(0, 351, 25):
        budget = budget_paisa / 100
        expected_benefit, expected_cost = brute_force_objective(options, budget)
        result = select_investments(options, budget)
        assert result["period_benefit_l"] == expected_benefit
        assert reference_paisa(result["total_cost_inr"]) == expected_cost
        assert_legal(result, budget)


def test_one_property_cannot_receive_two_replacement_tanks():
    options = [
        quotation("a", 20, 30, 1000),
        quotation("a", 30, 40, 2000),
        quotation("b", 10, 15, 1000),
    ]
    result = select_investments(options, 50)
    assert result["period_benefit_l"] == 55
    assert result["total_cost_inr"] == 40
    assert {option["property_id"] for option in result["selected"]} == {"a", "b"}
    assert_legal(result, 50)


def test_exact_selection_beats_greedy_benefit_per_cost():
    options = [quotation("a", 6, 12), quotation("b", 5, 9), quotation("c", 5, 9)]
    result = select_investments(options, 10)
    assert {option["property_id"] for option in result["selected"]} == {"b", "c"}
    assert result["period_benefit_l"] == 18


def test_equal_benefit_uses_the_cheapest_legal_plan():
    options = [quotation("a", 9, 20, 1000), quotation("a", 10, 20, 2000)]
    result = select_investments(options, 10)
    assert result["period_benefit_l"] == 20
    assert result["total_cost_inr"] == 9
    assert result["budget_remaining_inr"] == 1


def test_equal_cost_and_benefit_ties_do_not_change_the_objective():
    options = [quotation("a", 10, 20), quotation("b", 10, 20)]
    forward = select_investments(options, 10)
    reverse = select_investments(list(reversed(options)), 10)
    assert forward["period_benefit_l"] == reverse["period_benefit_l"] == 20
    assert forward["total_cost_inr"] == reverse["total_cost_inr"] == 10
    assert_legal(forward, 10)
    assert_legal(reverse, 10)


def test_empty_quotes_leave_the_entire_budget_available():
    result = select_investments([], 2500.75)
    assert result["selected"] == []
    assert result["period_benefit_l"] == 0
    assert result["total_cost_inr"] == 0
    assert result["budget_remaining_inr"] == 2500.75


def test_zero_negative_and_unaffordable_benefits_do_not_force_investment():
    options = [quotation("a", 1, 0), quotation("b", 1, -100), quotation("c", 101, 1000)]
    result = select_investments(options, 100)
    assert result["selected"] == []
    assert result["budget_remaining_inr"] == 100


def test_zero_budget_selects_no_positive_cost_quote():
    result = select_investments([quotation("a", 0.01, 100)], 0)
    assert result["selected"] == []
    assert result["total_cost_inr"] == 0


def test_fractional_currency_can_spend_an_exact_cent_budget():
    options = [quotation("a", 10.15, 100), quotation("b", 20.29, 200)]
    result = select_investments(options, 30.44)
    assert result["period_benefit_l"] == 300
    assert result["total_cost_inr"] == 30.44
    assert result["budget_remaining_inr"] == 0
    assert_legal(result, 30.44)


def test_one_paisa_short_budget_excludes_the_combined_upgrade():
    options = [quotation("a", 0.33, 100), quotation("b", 0.67, 200)]
    result = select_investments(options, 0.99)
    assert result["period_benefit_l"] == 200
    assert len(result["selected"]) == 1
    assert_legal(result, 0.99)


@pytest.mark.parametrize(
    "value,expected", [(0.1 + 0.7, 80), (0.3 + 0.6, 90), (0.29, 29), (123456.78, 12345678)]
)
def test_cent_conversion_normalises_binary_float_noise_without_truncation(value, expected):
    assert paisa(value) == expected


def test_api_validated_quote_cannot_exceed_budget_due_to_float_noise():
    validated = Investment(
        property_id="a",
        capacity_l=1000,
        cost_inr=0.1 + 0.7,
        quote_source="Synthetic automated-test quotation",
        installation_space_confirmed=True,
    )
    option = {**validated.model_dump(), "period_benefit_l": 100}
    result = select_investments([option], 0.79)
    assert result["selected"] == []
    assert_legal(result, 0.79)


def test_binary_float_budget_accepts_a_truly_affordable_cent_quote():
    result = select_investments([quotation("a", 0.9, 100)], 0.3 + 0.6)
    assert len(result["selected"]) == 1
    assert result["total_cost_inr"] == 0.9
    assert_legal(result, 0.3 + 0.6)


@pytest.mark.parametrize("invalid_cost", [0, -1, 0.005, float("nan"), float("inf")])
def test_quote_boundary_rejects_invalid_or_sub_paisa_currency(invalid_cost):
    with pytest.raises(ValidationError):
        Investment(
            property_id="a",
            capacity_l=1000,
            cost_inr=invalid_cost,
            quote_source="Synthetic automated-test quotation",
            installation_space_confirmed=True,
        )


def test_quote_provenance_and_input_records_are_preserved():
    options = [quotation("a", 10, 20), quotation("b", 10, 30)]
    before = copy.deepcopy(options)
    result = select_investments(options, 20)
    assert options == before
    assert all(
        option["quote_source"] == "Synthetic automated-test quotation" for option in result["selected"]
    )


def test_bounded_solver_reports_nondominated_state_limit():
    # All subset sums have distinct, increasing cost and benefit: no frontier
    # state is dominated. Sixteen legal property choices exceed the safe cap.
    options = [quotation(f"property-{index:02d}", (2**index) / 100, 2**index) for index in range(16)]
    with pytest.raises(ValueError, match="nondominated budget combinations"):
        select_investments(options, (2**16 - 1) / 100)
