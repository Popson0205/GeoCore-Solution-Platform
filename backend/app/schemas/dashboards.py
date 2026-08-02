"""Schemas for the dashboard *builder* — multiple named, widget-based
dashboards per project (blueprint section 18). Distinct from
schemas/dashboard.py, which is the original single fixed-indicators panel
(GET /projects/{id}/dashboard) — that one stays as-is; this is additive.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator

WIDGET_TYPES = {
    "kpi",
    "bar_chart",
    "pie_chart",
    "line_chart",
    "table",
    "map",
    "gauge",
    "list",
    "details",
    "rich_text",
    "embedded",
}


class DashboardCreate(BaseModel):
    name: str
    description: Optional[str] = None
    # Optional folder tag when creating via the org-wide route (Portal
    # redesign Phase 2, this Phase 6) — must belong to the same
    # organisation as the route's organisation_id if given.
    project_id: Optional[uuid.UUID] = None


class DashboardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    # {"preset": "dark", "overrides": {...}} or None to reset to default.
    # See models/dashboard.py's `theme` column docstring for the shape.
    theme: Optional[dict[str, Any]] = None
    # "private" | "organization" | "public" — see core/content_visibility.py.
    visibility: Optional[str] = None

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in {"private", "organization", "public"}:
            raise ValueError("visibility must be one of ['private', 'organization', 'public']")
        return value


class WidgetLayout(BaseModel):
    x: int = 0
    y: int = 0
    w: int = 4
    h: int = 3


class WidgetCreate(BaseModel):
    widget_type: str
    title: str
    config: dict[str, Any] = {}
    layout: WidgetLayout = WidgetLayout()

    @field_validator("widget_type")
    @classmethod
    def validate_widget_type(cls, value: str) -> str:
        if value not in WIDGET_TYPES:
            raise ValueError(f"widget_type must be one of {sorted(WIDGET_TYPES)}")
        return value


class WidgetUpdate(BaseModel):
    title: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    layout: Optional[WidgetLayout] = None
    # Set when the widget is dragged to a new position on the dashboard
    # (frontend/src/pages/DashboardDetail.jsx) — persists the new order.
    sort_order: Optional[int] = None


class WidgetOut(BaseModel):
    id: uuid.UUID
    widget_type: str
    title: str
    config: dict[str, Any]
    layout: dict[str, Any]
    sort_order: int

    model_config = {"from_attributes": True}


class DashboardOut(BaseModel):
    id: uuid.UUID
    # Scope now lives on organisation_id; project_id is an optional folder
    # tag (Portal redesign Phase 2, this Phase 6).
    organisation_id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    name: str
    description: Optional[str] = None
    theme: Optional[dict[str, Any]] = None
    visibility: str = "organization"
    created_by: Optional[uuid.UUID] = None
    updated_at: datetime
    widgets: list[WidgetOut] = []

    model_config = {"from_attributes": True}


class DashboardSummaryOut(BaseModel):
    """Lighter-weight shape for listing dashboards without every widget's
    full config.
    """

    id: uuid.UUID
    name: str
    description: Optional[str] = None
    visibility: str = "organization"
    updated_at: datetime
    widget_count: int
