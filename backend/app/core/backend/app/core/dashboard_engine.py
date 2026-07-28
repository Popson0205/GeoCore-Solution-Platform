"""Turns a DashboardWidget's `config` into the actual numbers/rows it
displays (blueprint section 18: Reporting and Analytics). Every function
here works on plain Python objects (record-like things with `.field_data`,
`.geometry`, `.created_at`) rather than live SQLAlchemy queries — filtering
and aggregation happen in Python over records already fetched for the
project.

This is a deliberate MVP trade-off: at real scale (tens of thousands of
records per project) this should become DB-side aggregation (SQL GROUP BY
on JSONB fields, or a real column per commonly-charted field), but for a
project's dashboard-sized dataset it's simple, correct, and easy to reason
about — see docs/CHANGES_DASHBOARDS.md.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from backend.app.core.visibility import matches_conditions


def apply_filters(records: list[Any], filters: list[dict] | None) -> list[Any]:
    if not filters:
        return records
    return [r for r in records if matches_conditions(filters, r.field_data or {})]


def _numeric_values(records: list[Any], field_key: str) -> list[float]:
    values = []
    for r in records:
        raw = (r.field_data or {}).get(field_key)
        try:
            if raw is not None and raw != "":
                values.append(float(raw))
        except (TypeError, ValueError):
            continue
    return values


def compute_kpi(records: list[Any], config: dict) -> dict:
    records = apply_filters(records, config.get("filters"))
    aggregation = config.get("aggregation", "count")

    if aggregation == "count":
        return {"value": len(records), "aggregation": "count"}

    field_key = config.get("field_key")
    values = _numeric_values(records, field_key) if field_key else []
    if not values:
        return {"value": None, "aggregation": aggregation}

    result = {
        "sum": sum(values),
        "avg": sum(values) / len(values),
        "min": min(values),
        "max": max(values),
    }.get(aggregation)
    return {"value": result, "aggregation": aggregation}


def compute_group_chart(records: list[Any], config: dict, max_groups: int = 20) -> list[dict]:
    records = apply_filters(records, config.get("filters"))
    group_key = config.get("group_by_field_key")
    aggregation = config.get("aggregation", "count")
    value_key = config.get("value_field_key")

    buckets: dict[str, list[Any]] = defaultdict(list)
    for r in records:
        raw = (r.field_data or {}).get(group_key)
        label = str(raw) if raw not in (None, "") else "(blank)"
        buckets[label].append(r)

    rows = []
    for label, bucket in buckets.items():
        if aggregation == "count":
            value = len(bucket)
        else:
            values = _numeric_values(bucket, value_key) if value_key else []
            value = {
                "sum": sum(values) if values else 0,
                "avg": (sum(values) / len(values)) if values else 0,
            }.get(aggregation, len(bucket))
        rows.append({"label": label, "value": value})

    rows.sort(key=lambda r: r["value"], reverse=True)
    return rows[:max_groups]


def _period_key(dt: datetime, interval: str) -> str:
    if interval == "day":
        return dt.strftime("%Y-%m-%d")
    if interval == "week":
        year, week, _ = dt.isocalendar()
        return f"{year}-W{week:02d}"
    return dt.strftime("%Y-%m")  # month, default


def compute_time_series(records: list[Any], config: dict) -> list[dict]:
    records = apply_filters(records, config.get("filters"))
    interval = config.get("interval", "month")
    aggregation = config.get("aggregation", "count")
    value_key = config.get("value_field_key")

    buckets: dict[str, list[Any]] = defaultdict(list)
    for r in records:
        if not r.created_at:
            continue
        buckets[_period_key(r.created_at, interval)].append(r)

    rows = []
    for period, bucket in buckets.items():
        if aggregation == "count":
            value = len(bucket)
        else:
            values = _numeric_values(bucket, value_key) if value_key else []
            value = {
                "sum": sum(values) if values else 0,
                "avg": (sum(values) / len(values)) if values else 0,
            }.get(aggregation, len(bucket))
        rows.append({"period": period, "value": value})

    rows.sort(key=lambda r: r["period"])
    return rows


def compute_table(records: list[Any], config: dict) -> dict:
    records = apply_filters(records, config.get("filters"))
    field_keys = config.get("field_keys") or []
    limit = config.get("limit") or 50
    records = sorted(records, key=lambda r: r.created_at or datetime.min, reverse=True)[:limit]

    rows = [[(r.field_data or {}).get(key) for key in field_keys] for r in records]
    return {"columns": field_keys, "rows": rows}


def compute_map(records: list[Any], config: dict) -> list[dict]:
    records = apply_filters(records, config.get("filters"))
    return [
        {"id": str(r.id), "asset_type_id": str(r.asset_type_id), "geometry": r.geometry}
        for r in records
    ]


def compute_gauge(records: list[Any], config: dict) -> dict:
    """A KPI expressed as a percentage of a target — e.g. current
    population vs. total capacity, matching an occupancy-rate gauge.
    `max_value` is a fixed number in config; if absent, it's computed the
    same way as the value (aggregation over `max_field_key`) — useful when
    the target itself is a sum of another field rather than a constant.
    """
    kpi = compute_kpi(records, {**config, "field_key": config.get("field_key")})
    value = kpi["value"] or 0

    max_value = config.get("max_value")
    if max_value is None and config.get("max_field_key"):
        max_kpi = compute_kpi(
            records,
            {
                "filters": config.get("filters"),
                "aggregation": config.get("max_aggregation", "sum"),
                "field_key": config.get("max_field_key"),
            },
        )
        max_value = max_kpi["value"]

    if not max_value:
        return {"value": value, "max_value": None, "percent": None}

    percent = round((value / max_value) * 100, 1)
    return {"value": value, "max_value": max_value, "percent": max(0, min(percent, 100))}


def compute_list(records: list[Any], config: dict) -> dict:
    """Records rendered as a scrollable list — e.g. a facility roster —
    rather than aggregated into a number or chart.
    """
    records = apply_filters(records, config.get("filters"))
    limit = config.get("limit") or 50
    title_key = config.get("title_field_key")
    subtitle_keys = config.get("subtitle_field_keys") or []
    icon_key = config.get("icon_field_key")

    records = sorted(records, key=lambda r: r.created_at or datetime.min, reverse=True)[:limit]

    rows = []
    for r in records:
        data = r.field_data or {}
        subtitle = " · ".join(str(data[k]) for k in subtitle_keys if data.get(k) not in (None, ""))
        rows.append(
            {
                "id": str(r.id),
                "title": str(data.get(title_key)) if title_key and data.get(title_key) else "(untitled)",
                "subtitle": subtitle,
                "icon_value": data.get(icon_key) if icon_key else None,
            }
        )
    return {"rows": rows}


def compute_widget(widget: Any, records_by_asset_type: dict[str, list[Any]]) -> dict:
    """`records_by_asset_type` maps str(asset_type_id) -> that asset type's
    records for the project. Map widgets with no asset_type_id in their
    config get every asset type's records combined.
    """
    config = widget.config or {}
    asset_type_id = config.get("asset_type_id")

    if widget.widget_type == "map" and not asset_type_id:
        records = [r for recs in records_by_asset_type.values() for r in recs]
    else:
        records = records_by_asset_type.get(str(asset_type_id), []) if asset_type_id else []

    if widget.widget_type == "kpi":
        return compute_kpi(records, config)
    if widget.widget_type == "gauge":
        return compute_gauge(records, config)
    if widget.widget_type in ("bar_chart", "pie_chart"):
        return {"rows": compute_group_chart(records, config)}
    if widget.widget_type == "line_chart":
        return {"rows": compute_time_series(records, config)}
    if widget.widget_type == "table":
        return compute_table(records, config)
    if widget.widget_type == "list":
        return compute_list(records, config)
    if widget.widget_type == "map":
        return {"features": compute_map(records, config)}
    return {"error": f"Unknown widget type: {widget.widget_type}"}
