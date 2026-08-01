import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Dashboard(Base):
    """A saved arrangement of widgets over a project's data (blueprint
    section 18: Reporting and Analytics — the "Understand information"
    step of the platform workflow). A project can have several dashboards
    (e.g. one for field operations, one for management).
    """

    __tablename__ = "dashboards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # The tenancy boundary (Portal redesign Phase 2, this Phase 6) — every
    # access check resolves through this rather than through the (optional)
    # project, the same shift Survey/Record made in Phase 1.
    organisation_id = Column(
        UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False, index=True
    )
    # Now just an optional folder tag, no longer the scope boundary —
    # dashboards are scoped by organisation_id instead (Portal redesign
    # Phase 2, this Phase 6).
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    organisation = relationship("Organisation")
    project = relationship("Project", backref="dashboards")
    widgets = relationship(
        "DashboardWidget",
        back_populates="dashboard",
        cascade="all, delete-orphan",
        order_by="DashboardWidget.sort_order",
    )


class DashboardWidget(Base):
    """One tile on a dashboard — a KPI, chart, table, or map, each bound to
    a project's records ("feature layer") through `config`. See
    backend/app/core/dashboard_engine.py for how `config` is turned into
    actual numbers.

    `config` shape depends on `widget_type` (each Survey is itself a
    "feature layer" now that the flat model retired the separate AssetType
    layer — a widget binds to one Survey's records directly):
      kpi:        {survey_id, aggregation, field_key?, filters?}
      bar_chart / pie_chart:
                  {survey_id, group_by_field_key, aggregation, value_field_key?, filters?}
      line_chart: {survey_id, interval, aggregation, value_field_key?, filters?}
      table:      {survey_id, field_keys, filters?, limit?}
      map:        {survey_id?, filters?}   (survey_id omitted = every survey)

    `layout` is grid position: {"x", "y", "w", "h"} on a 12-column grid.
    """

    __tablename__ = "dashboard_widgets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dashboard_id = Column(UUID(as_uuid=True), ForeignKey("dashboards.id"), nullable=False)
    widget_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    config = Column(JSONB, default=dict, nullable=False)
    layout = Column(JSONB, default=dict, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    dashboard = relationship("Dashboard", back_populates="widgets")
