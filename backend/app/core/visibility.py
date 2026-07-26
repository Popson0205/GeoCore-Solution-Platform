"""Evaluates a field or section's visibility rule (skip logic) against the
values collected so far in the same scope — either the top-level form, or
the fields of a single repeat instance for a repeatable section (blueprint
section 12: Forms and Field Data Collection).
"""

from typing import Any

VISIBILITY_OPERATORS = {
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "greater_than",
    "less_than",
    "greater_or_equal",
    "less_or_equal",
    "is_empty",
    "is_not_empty",
}


def _is_blank(value: Any) -> bool:
    return value is None or value == "" or value == []


def compare_value(operator_name: str, actual: Any, expected: Any) -> bool:
    if operator_name == "is_empty":
        return _is_blank(actual)
    if operator_name == "is_not_empty":
        return not _is_blank(actual)
    if actual is None:
        # A condition referencing a not-yet-answered field simply isn't met
        # yet — that's normal mid-fill, not an error.
        return False

    if operator_name == "equals":
        return str(actual) == str(expected)
    if operator_name == "not_equals":
        return str(actual) != str(expected)
    if operator_name == "contains":
        haystack = actual if isinstance(actual, list) else str(actual)
        return str(expected) in haystack
    if operator_name == "not_contains":
        haystack = actual if isinstance(actual, list) else str(actual)
        return str(expected) not in haystack

    try:
        actual_num = float(actual)
        expected_num = float(expected)
    except (TypeError, ValueError):
        return False
    if operator_name == "greater_than":
        return actual_num > expected_num
    if operator_name == "less_than":
        return actual_num < expected_num
    if operator_name == "greater_or_equal":
        return actual_num >= expected_num
    if operator_name == "less_or_equal":
        return actual_num <= expected_num
    return False


def matches_conditions(conditions: list[dict] | None, values: dict, combinator: str = "all") -> bool:
    """Same evaluation as is_visible, but for a bare conditions list rather
    than a {"combinator", "conditions"} rule — this is the shape dashboard
    widget filters use (backend/app/core/dashboard_engine.py).
    """
    if not conditions:
        return True
    results = [compare_value(c["operator"], values.get(c["field_key"]), c.get("value")) for c in conditions]
    return all(results) if combinator == "all" else any(results)


def is_visible(rule: dict | None, values: dict) -> bool:
    """`rule` shape: {"combinator": "all"|"any", "conditions": [{"field_key",
    "operator", "value"}, ...]}. A field/section with no rule (or an empty
    condition list) is always visible.
    """
    if not rule or not rule.get("conditions"):
        return True
    return matches_conditions(rule["conditions"], values, rule.get("combinator", "all"))
