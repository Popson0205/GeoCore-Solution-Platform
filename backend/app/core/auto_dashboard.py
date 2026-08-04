"""GeoAI Auto-Dashboard — looks at a Feature Layer's actual field types and
geometry, and proposes a sensible starting set of widgets: a KPI for
numeric fields, a bar chart for categorical fields, a trend line for
date fields, a map if there's geometry, and a data table. This is
deliberately a fast, deterministic rule-based match (field type ->
indicator type), not an LLM call — it needs to run instantly and work
identically with or without GeoAI/Anthropic configured, since "does this
survey have a number field" doesn't need judgement, just correct rules.

The result is a completely ordinary Dashboard with ordinary widgets —
nothing about it is "AI-managed" or special going forward. Every widget
this creates can be edited, moved, or deleted by hand afterward exactly
like one built manually from scratch; this only saves the first blank-
page moment.
"""

from typing import Any

# How many of each kind to include before we've said enough — avoids
# generating an overwhelming 20-widget dashboard from a form with 15
# fields. Chosen to keep a first-look dashboard readable at a glance.
MAX_NUMERIC_KPIS = 3
MAX_CATEGORICAL_CHARTS = 2
MAX_DATE_TRENDS = 1
MAX_TABLE_COLUMNS = 6

CATEGORICAL_TYPES = {"single_select", "boolean"}
DATE_TYPES = {"date", "datetime"}
# Field types that make sense as a plain table column — excludes large
# binary-ish fields (photo/video/file/signature) that would just show as
# an unreadable blob in a data-preview table.
TABLE_FRIENDLY_TYPES = {"text", "long_text", "number", "single_select", "multi_select", "boolean", "date", "datetime"}


def _kpi_widget(field, x: int, y: int) -> dict:
    return {
        "widget_type": "kpi",
        "title": f"Total {field['label']}",
        "config": {"aggregation": "sum", "field_key": field["field_key"]},
        "layout": {"x": x, "y": y, "w": 3, "h": 4},
    }


def _count_kpi_widget(x: int, y: int) -> dict:
    return {
        "widget_type": "kpi",
        "title": "Total records",
        "config": {"aggregation": "count", "field_key": None},
        "layout": {"x": x, "y": y, "w": 3, "h": 4},
    }


def _bar_chart_widget(field, x: int, y: int, w: int = 6) -> dict:
    return {
        "widget_type": "bar_chart",
        "title": f"{field['label']} breakdown",
        "config": {
            "group_by_field_key": field["field_key"],
            "aggregation": "count",
            "value_field_key": None,
        },
        "layout": {"x": x, "y": y, "w": w, "h": 4},
    }


def _line_chart_widget(field, x: int, y: int, w: int = 6) -> dict:
    return {
        "widget_type": "line_chart",
        "title": f"{field['label']} over time",
        "config": {"interval": "month", "aggregation": "count", "value_field_key": None},
        "layout": {"x": x, "y": y, "w": w, "h": 4},
    }


def _map_widget(x: int, y: int, w: int = 12, h: int = 6) -> dict:
    return {"widget_type": "map", "title": "Map", "config": {}, "layout": {"x": x, "y": y, "w": w, "h": h}}


def _table_widget(field_keys: list[str], x: int, y: int) -> dict:
    return {
        "widget_type": "table",
        "title": "Recent records",
        "config": {"field_keys": field_keys, "limit": 20},
        "layout": {"x": x, "y": y, "w": 12, "h": 4},
    }


def build_widget_plan(field_definitions: list[dict], geometry_type: str) -> list[dict]:
    """`field_definitions` items need at least `field_key`, `label`,
    `field_type`. Returns a list of {widget_type, title, config, layout}
    dicts ready to become DashboardWidget rows (feature_layer_id is
    filled in by the caller, since this function doesn't need to know
    which layer it's for). Layout uses a 12-column grid, top to bottom.
    """
    numeric = [f for f in field_definitions if f["field_type"] == "number"][:MAX_NUMERIC_KPIS]
    categorical = [f for f in field_definitions if f["field_type"] in CATEGORICAL_TYPES][:MAX_CATEGORICAL_CHARTS]
    date_fields = [f for f in field_definitions if f["field_type"] in DATE_TYPES][:MAX_DATE_TRENDS]
    has_map = geometry_type != "none"

    widgets: list[dict] = []
    y = 0

    # Row 1: KPIs — always a record count, then up to MAX_NUMERIC_KPIS
    # numeric-field totals, 4 per row (w=3 each) before wrapping. Each
    # KPI tile is h=4 (not the more compact 2 rows it might look like it
    # needs) -- verified against a real rendered screenshot that 2 rows
    # (80px) clips the badge+value content, which needs more like 4
    # rows (160px) to actually be visible instead of cut off.
    kpi_specs = [None] + numeric  # None = the plain count KPI
    x = 0
    for spec in kpi_specs:
        if x >= 12:
            x = 0
            y += 4
        widgets.append(_count_kpi_widget(x, y) if spec is None else _kpi_widget(spec, x, y))
        x += 3
    y += 4

    # Row 2: the map, full width, if this layer has geometry at all.
    if has_map:
        widgets.append(_map_widget(0, y))
        y += 6

    # Row 3: categorical breakdowns and the date trend, sharing rows two
    # at a time (each half-width) since a bar/pie/line chart needs more
    # room than a KPI tile to stay readable.
    charts = [("bar", f) for f in categorical] + [("line", f) for f in date_fields]
    x = 0
    for kind, field in charts:
        if x >= 12:
            x = 0
            y += 4
        widget = _bar_chart_widget(field, x, y) if kind == "bar" else _line_chart_widget(field, x, y)
        widgets.append(widget)
        x += 6
    if charts:
        y += 4

    # Final row: a data-preview table, whichever readable fields exist.
    table_fields = [f["field_key"] for f in field_definitions if f["field_type"] in TABLE_FRIENDLY_TYPES]
    if table_fields:
        widgets.append(_table_widget(table_fields[:MAX_TABLE_COLUMNS], 0, y))

    return widgets
