"""Schemas for the dashboard *builder* — multiple named, widget-based
dashboards per project (blueprint section 18). Distinct from
schemas/dashboard.py, which is the original single fixed-indicators panel
(GET /projects/{id}/dashboard) — that one stays as-is; this is additive.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator

WIDGET_TYPES = {"kpi", "bar_chart", "pie_chart", "line_chart", "table", "map", "gauge", "list"}


class DashboardCreate(BaseModel):
    name: str
    description: Optional[str] = None


class DashboardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


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
    project_id: uuid.UUID
    name: str
    description: Optional[str] = None
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
    updated_at: datetime
    widget_count: int


class FeatureLayerOut(BaseModel):
    """One asset type, discoverable as a dashboard data source from
    anywhere in the organisation — not just the dashboard's own project.
    See GET /organisations/{id}/feature-layers.
    """

    asset_type_id: uuid.UUID
    name: str
    color: str
    geometry_type: str
    project_id: uuid.UUID
    project_name: str
    record_count: int
