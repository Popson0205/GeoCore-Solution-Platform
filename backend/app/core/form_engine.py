"""Server-side processing of a record's field_data against its parent
Survey's form definition (blueprint section 12: Forms and Field Data
Collection). A Survey *is* the form (flat Survey123/KoBo model) — it owns
its sections/field_definitions directly, so this validates straight
against the Survey with no asset-type indirection.

This runs on every record create/update — see routes/records.py — so
validation and calculations can never be bypassed by a client that skips
the form UI (a raw API call, a script, or eventually a public submission
link). It:

1. Evaluates visibility (skip logic) for every section and field, so a
   hidden field is never required or validated.
2. Recomputes every calculated field from the *other* submitted values,
   overwriting whatever the client sent for it — a calculated field is
   never trusted from the client.
3. Runs required/min/max/length/pattern/cross-field validation and
   collects every error before raising once, so a person filling a long
   form sees all their mistakes at once rather than one at a time.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from backend.app.core.expressions import ExpressionError, evaluate
from backend.app.core.visibility import is_visible

if TYPE_CHECKING:
    from backend.app.models.survey import FieldDefinition, Survey


class FormValidationError(ValueError):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def _validate_single(field: FieldDefinition, value: Any, values: dict, errors: list[str]) -> None:
    rule = field.validation or {}

    if value in (None, "", []):
        return  # required-ness is checked by the caller before this

    if field.field_type == "number":
        try:
            num = float(value)
        except (TypeError, ValueError):
            errors.append(f"{field.label} must be a number")
            return
        if rule.get("min") is not None and num < rule["min"]:
            errors.append(f"{field.label} must be at least {rule['min']}")
        if rule.get("max") is not None and num > rule["max"]:
            errors.append(f"{field.label} must be at most {rule['max']}")

    if field.field_type in ("text", "long_text"):
        text = str(value)
        if rule.get("min_length") is not None and len(text) < rule["min_length"]:
            errors.append(f"{field.label} must be at least {rule['min_length']} characters")
        if rule.get("max_length") is not None and len(text) > rule["max_length"]:
            errors.append(f"{field.label} must be at most {rule['max_length']} characters")
        pattern = rule.get("pattern")
        if pattern:
            try:
                if not re.match(pattern, text):
                    errors.append(f"{field.label} doesn't match the required format")
            except re.error:
                errors.append(f"{field.label} has an invalid validation pattern configured")

    compare = rule.get("compare")
    if compare:
        other = values.get(compare["field_key"])
        if other not in (None, ""):
            try:
                a, b = float(value), float(other)
            except (TypeError, ValueError):
                a = b = None
            if a is not None:
                ok = {
                    "greater_than": a > b,
                    "less_than": a < b,
                    "greater_or_equal": a >= b,
                    "less_or_equal": a <= b,
                    "equals": a == b,
                    "not_equals": a != b,
                }.get(compare["operator"], True)
                if not ok:
                    errors.append(compare.get("message") or f"{field.label} fails a comparison rule")


def _process_scope(
    fields: list[FieldDefinition],
    values: dict,
    errors: list[str],
    section_by_id: dict | None = None,
) -> dict:
    """Evaluate visibility, apply calculations, and validate one flat scope
    — either the survey's top-level fields, or a single repeat instance's
    fields. Returns the processed values (calculated fields overwritten
    with their server-recomputed value).
    """
    processed = dict(values)
    for field in fields:
        if field.field_type == "location":
            continue  # a layout marker, not a real data field — see FIELD_TYPES
        section = section_by_id.get(field.section_id) if section_by_id and field.section_id else None
        if section is not None and not is_visible(section.visibility, processed):
            continue  # the whole section (page) is hidden right now
        if not is_visible(field.visibility, processed):
            continue  # hidden fields are neither required nor validated

        if field.calculation:
            try:
                processed[field.field_key] = evaluate(field.calculation, processed)
            except ExpressionError as exc:
                errors.append(f"{field.label}: {exc}")
            continue  # calculated fields aren't user-validated

        value = processed.get(field.field_key)
        if field.is_required and value in (None, "", []):
            errors.append(f"{field.label} is required")
            continue
        _validate_single(field, value, processed, errors)
    return processed


def process_submission(survey: Survey, field_data: dict) -> dict:
    """The authoritative pass over a submission. Call this from
    routes/records.py on every create and update — never persist
    field_data that hasn't been through here.
    """
    errors: list[str] = []
    field_data = dict(field_data or {})

    section_by_id = {section.id: section for section in survey.sections}
    top_level_fields = [
        f
        for f in survey.field_definitions
        if f.section_id is None or not section_by_id[f.section_id].repeatable
    ]

    processed = _process_scope(top_level_fields, field_data, errors, section_by_id)

    for section in survey.sections:
        if not section.repeatable:
            continue
        if not is_visible(section.visibility, processed):
            continue  # hidden repeat section: don't require or store it

        instances = field_data.get(section.section_key) or []
        if not isinstance(instances, list):
            errors.append(f"{section.title} must be a list of entries")
            continue
        processed[section.section_key] = [
            _process_scope(section.fields, instance or {}, errors) for instance in instances
        ]

    if errors:
        raise FormValidationError(errors)

    return processed
