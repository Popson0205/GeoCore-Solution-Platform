"""Best-effort XLSForm (Survey123 / KoBo Collect / ODK) importer.

Reads the standard "survey" and "choices" sheets and converts them into
the same FormDefinition shape the form builder produces (sections + fields
with visibility/calculation/validation) — see
backend/app/schemas/asset_type.py's FormSectionCreate/FieldDefinitionCreate.

This is deliberately NOT a full XLSForm/XPath implementation — `relevant`,
`calculation`, and `constraint` are a full expression language in the real
spec. This module recognizes a pragmatic subset of common patterns (simple
comparisons, single-combinator and/or chains, selected()) and reports
anything it can't confidently convert as a warning rather than silently
guessing wrong — the field still imports, just without that one rule, and
the warning tells the person exactly what to re-add by hand in the
builder.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field as dc_field

from backend.app.core.slugify import slugify_key

TYPE_MAP = {
    "text": "text",
    "string": "text",
    "integer": "number",
    "decimal": "number",
    "range": "number",
    "date": "date",
    "datetime": "datetime",
    "time": "text",  # no dedicated time field type in GeoCore yet
    "image": "photo",
    "photo": "photo",
    "video": "video",
    "audio": "file",
    "file": "file",
    "signature": "signature",
    "calculate": "number",  # a hidden derived field — see _is_calculate_type
}

GEOMETRY_QUESTION_TYPES = {
    "geopoint": "point",
    "geotrace": "line",
    "geoshape": "polygon",
}

SKIP_TYPES = {"note", "geopoint", "geotrace", "geoshape", "start", "end", "deviceid", "audit"}
# ^ location questions become the record's geometry rather than a form
# field (GeoCore captures location via its own map picker, not as a
# regular question); metadata questions (start/end/deviceid/audit) have
# no GeoCore equivalent and are silently dropped rather than warned about
# — they're implementation detail in the source form, not data loss a
# person would notice.

UNSUPPORTED_CALC_FUNCTIONS = ("if(", "concat(", "once(", "today(", "now(", "coalesce(", "pulldata(")


class XLSFormError(ValueError):
    pass


@dataclass
class ParsedField:
    label: str
    field_type: str
    field_key: str
    is_required: bool = False
    options: list[str] | None = None
    visibility: dict | None = None
    calculation: str | None = None
    validation: dict | None = None


@dataclass
class ParsedSection:
    title: str
    repeatable: bool = False
    repeat_label: str | None = None
    fields: list[ParsedField] = dc_field(default_factory=list)


@dataclass
class ParsedForm:
    name: str
    geometry_type: str
    sections: list[ParsedSection]
    warnings: list[str]


# ---------------------------------------------------------------------------
# Expression conversion (relevant / calculation / constraint) — pure
# functions, independently testable without an actual xlsx file.
# ---------------------------------------------------------------------------

_COMPARISON = r"(=|!=|>=|<=|>|<)"
_FIELD_REF = re.compile(r"\$\{(\w+)\}")
_SIMPLE_COMPARISON = re.compile(
    r"\$\{(?P<field>\w+)\}\s*" + _COMPARISON + r"\s*'(?P<value>[^']*)'"
)
_NUMERIC_COMPARISON = re.compile(
    r"\$\{(?P<field>\w+)\}\s*" + _COMPARISON + r"\s*(?P<value>-?\d+(\.\d+)?)"
)
_SELECTED = re.compile(r"selected\(\s*\$\{(?P<field>\w+)\}\s*,\s*'(?P<value>[^']*)'\s*\)")
_NOT_SELECTED = re.compile(r"not\(\s*selected\(\s*\$\{(?P<field>\w+)\}\s*,\s*'(?P<value>[^']*)'\s*\)\s*\)")

_OPERATOR_MAP = {"=": "equals", "!=": "not_equals", ">": "greater_than", "<": "less_than", ">=": "greater_or_equal", "<=": "less_or_equal"}

_SELF_NUMERIC = re.compile(r"^\.\s*" + _COMPARISON + r"\s*(-?\d+(\.\d+)?)$")


def convert_relevant(expr: str) -> tuple[dict | None, str | None]:
    """Converts an XLSForm `relevant` expression into GeoCore's visibility
    rule shape. Returns (rule, warning) — rule is None if nothing could be
    converted (warning explains why); warning is None on a clean convert.
    """
    expr = expr.strip()
    if not expr:
        return None, None

    if " and " in expr and " or " in expr:
        return None, f"Skipped skip-logic (mixes 'and'/'or', not representable): {expr}"

    combinator = "any" if " or " in expr else "all"
    parts = re.split(r"\s+and\s+|\s+or\s+", expr)

    conditions = []
    for part in parts:
        part = part.strip()
        m = _SELECTED.match(part)
        if m:
            conditions.append({"field_key": m.group("field"), "operator": "contains", "value": m.group("value")})
            continue
        m = _NOT_SELECTED.match(part)
        if m:
            conditions.append({"field_key": m.group("field"), "operator": "not_contains", "value": m.group("value")})
            continue
        m = _SIMPLE_COMPARISON.match(part)
        if m:
            conditions.append(
                {"field_key": m.group("field"), "operator": _OPERATOR_MAP[m.group(2)], "value": m.group("value")}
            )
            continue
        m = _NUMERIC_COMPARISON.match(part)
        if m:
            conditions.append(
                {"field_key": m.group("field"), "operator": _OPERATOR_MAP[m.group(2)], "value": float(m.group("value"))}
            )
            continue
        return None, f"Skipped skip-logic (couldn't parse condition '{part}'): {expr}"

    return {"combinator": combinator, "conditions": conditions}, None


def convert_calculation(expr: str) -> tuple[str | None, str | None]:
    """Converts an XLSForm `calculation` expression's ${field} references
    to GeoCore's {field} syntax. Warns (but still returns the converted
    text) if it uses a function GeoCore's evaluator doesn't support —
    saving it means someone can simplify it by hand instead of retyping
    the whole thing from scratch.
    """
    expr = expr.strip()
    if not expr:
        return None, None
    converted = _FIELD_REF.sub(r"{\1}", expr)
    for fn in UNSUPPORTED_CALC_FUNCTIONS:
        if fn in converted:
            return converted, (
                f"Calculation uses '{fn.rstrip('(')}()', which GeoCore's calculation engine doesn't support "
                f"(only round/abs/min/max/sum and +-*/) — saved as-is, but it will error until simplified: {expr}"
            )
    return converted, None


def convert_constraint(expr: str) -> tuple[dict | None, str | None]:
    """Converts an XLSForm `constraint` expression (using `.` for "this
    field's value") into a min/max validation patch, where possible.
    """
    expr = expr.strip()
    if not expr:
        return None, None

    parts = re.split(r"\s+and\s+", expr)
    patch: dict = {}
    for part in parts:
        m = _SELF_NUMERIC.match(part.strip())
        if not m:
            return (patch or None), f"Skipped validation rule (couldn't parse '{part}'): {expr}"
        operator, value = m.group(1), float(m.group(2))
        if operator in (">=",):
            patch["min"] = value
        elif operator in (">",):
            patch["min"] = value
        elif operator in ("<=",):
            patch["max"] = value
        elif operator in ("<",):
            patch["max"] = value
        elif operator == "=":
            patch["min"] = patch["max"] = value
    return (patch or None), None


# ---------------------------------------------------------------------------
# Sheet parsing (needs openpyxl — imported lazily so this module stays
# importable, and the expression converters above stay testable, even in
# an environment where openpyxl isn't installed).
# ---------------------------------------------------------------------------


def _label_column(headers: list[str]) -> str | None:
    if "label" in headers:
        return "label"
    for h in headers:
        if h.startswith("label"):
            return h
    return None


def _sheet_to_dicts(ws) -> list[dict]:
    rows_iter = ws.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        return []
    headers = [str(h).strip().lower() if h is not None else "" for h in header_row]

    out = []
    for raw_row in rows_iter:
        if raw_row is None or all(v is None for v in raw_row):
            continue
        row = {}
        for header, value in zip(headers, raw_row):
            if header:
                row[header] = value
        out.append(row)
    return out


def _unique_key(base: str, used: set[str]) -> str:
    key = base
    suffix = 1
    while key in used:
        suffix += 1
        key = f"{base}_{suffix}"
    used.add(key)
    return key


def parse_xlsform(file_bytes: bytes, filename: str = "form") -> ParsedForm:
    try:
        import openpyxl
    except ImportError as exc:  # pragma: no cover - environment issue, not a form issue
        raise XLSFormError(
            "The backend is missing the 'openpyxl' package needed to read .xlsx files. "
            "Run `pip install -r requirements.txt` and restart the backend."
        ) from exc

    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as exc:
        raise XLSFormError(f"Couldn't open this file as an .xlsx workbook: {exc}") from exc

    sheet_names = {name.strip().lower(): name for name in wb.sheetnames}
    if "survey" not in sheet_names:
        raise XLSFormError(
            "No 'survey' sheet found — this doesn't look like an XLSForm "
            "(expected sheets named 'survey', and optionally 'choices' and 'settings')."
        )

    survey_rows = _sheet_to_dicts(wb[sheet_names["survey"]])
    choices_rows = _sheet_to_dicts(wb[sheet_names["choices"]]) if "choices" in sheet_names else []
    settings_rows = _sheet_to_dicts(wb[sheet_names["settings"]]) if "settings" in sheet_names else []

    default_name = filename.rsplit(".", 1)[0]
    return build_form_from_rows(survey_rows, choices_rows, settings_rows, default_name)


def build_form_from_rows(
    survey_rows: list[dict],
    choices_rows: list[dict],
    settings_rows: list[dict],
    default_name: str,
) -> ParsedForm:
    """The actual XLSForm -> GeoCore conversion, decoupled from openpyxl
    file I/O so it can be tested with plain dicts (exactly what
    `_sheet_to_dicts` would hand it from a real workbook).
    """
    if not survey_rows:
        raise XLSFormError("The 'survey' sheet is empty.")

    label_col = _label_column(list(survey_rows[0].keys())) or "label"
    choices_label_col = _label_column(list(choices_rows[0].keys())) if choices_rows else "label"

    choices_by_list: dict[str, list[str]] = {}
    for row in choices_rows:
        list_name = row.get("list_name")
        name = row.get("name")
        label = row.get(choices_label_col) or name
        if list_name and name is not None:
            choices_by_list.setdefault(str(list_name), []).append(str(label))

    form_name = default_name
    for row in settings_rows:
        if row.get("form_title"):
            form_name = str(row["form_title"])
            break

    warnings: list[str] = []
    geometry_type = "point"  # default if the form has no explicit geo question

    sections: list[ParsedSection] = [ParsedSection(title="General")]
    section_stack: list[ParsedSection] = [sections[0]]
    used_keys: set[str] = set()
    nesting_depth = 0

    for row in survey_rows:
        raw_type = str(row.get("type") or "").strip()
        name = str(row.get("name") or "").strip()
        label = str(row.get(label_col) or name or "").strip()
        if not raw_type:
            continue

        type_key = raw_type.split(" ")[0]  # "select_one xyz" -> "select_one"

        if raw_type.startswith("begin group") or raw_type.startswith("begin_group"):
            nesting_depth += 1
            if nesting_depth > 1:
                warnings.append(f"Flattened nested group '{label}' — GeoCore forms support one level of sections.")
                continue
            new_section = ParsedSection(title=label or "Section")
            sections.append(new_section)
            section_stack.append(new_section)
            continue

        if raw_type.startswith("end group") or raw_type.startswith("end_group"):
            if nesting_depth > 1:
                nesting_depth -= 1
                continue
            nesting_depth = max(0, nesting_depth - 1)
            if len(section_stack) > 1:
                section_stack.pop()
            continue

        if raw_type.startswith("begin repeat") or raw_type.startswith("begin_repeat"):
            nesting_depth += 1
            if nesting_depth > 1:
                warnings.append(f"Flattened nested repeat '{label}' — GeoCore forms support one level of repeats.")
                continue
            new_section = ParsedSection(title=label or "Repeat", repeatable=True, repeat_label=label or "Entry")
            sections.append(new_section)
            section_stack.append(new_section)
            continue

        if raw_type.startswith("end repeat") or raw_type.startswith("end_repeat"):
            if nesting_depth > 1:
                nesting_depth -= 1
                continue
            nesting_depth = max(0, nesting_depth - 1)
            if len(section_stack) > 1:
                section_stack.pop()
            continue

        if type_key in GEOMETRY_QUESTION_TYPES:
            geometry_type = GEOMETRY_QUESTION_TYPES[type_key]
            continue

        if type_key in SKIP_TYPES:
            continue

        options = None
        if type_key in ("select_one", "select_multiple"):
            list_name = raw_type.split(" ", 1)[1].strip() if " " in raw_type else ""
            options = choices_by_list.get(list_name, [])
            if not options:
                warnings.append(f"'{label}' references choice list '{list_name}' which has no choices — imported with no options.")
            field_type = "single_select" if type_key == "select_one" else "multi_select"
        elif type_key in TYPE_MAP:
            field_type = TYPE_MAP[type_key]
        else:
            warnings.append(f"Skipped unsupported question type '{raw_type}' ('{label}').")
            continue

        parsed = ParsedField(
            label=label or name or "Untitled question",
            field_type=field_type,
            field_key=_unique_key(slugify_key(name or label), used_keys),
            is_required=str(row.get("required") or "").strip().lower() in ("yes", "true", "1"),
            options=options,
        )

        relevant = row.get("relevant")
        if relevant:
            rule, warning = convert_relevant(str(relevant))
            parsed.visibility = rule
            if warning:
                warnings.append(warning)

        calculation = row.get("calculation")
        if calculation and (type_key == "calculate" or calculation):
            calc, warning = convert_calculation(str(calculation))
            parsed.calculation = calc
            if warning:
                warnings.append(warning)

        constraint = row.get("constraint")
        if constraint:
            patch, warning = convert_constraint(str(constraint))
            if patch:
                parsed.validation = patch
            if warning:
                warnings.append(warning)

        section_stack[-1].fields.append(parsed)

    sections = [s for s in sections if s.fields]
    if not sections:
        raise XLSFormError("No importable questions found in this form.")

    return ParsedForm(name=form_name, geometry_type=geometry_type, sections=sections, warnings=warnings)
