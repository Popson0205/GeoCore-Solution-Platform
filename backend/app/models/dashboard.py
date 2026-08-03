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
    # {"preset": "dark", "overrides": {"accentColor": "#0079c1", ...}} — see
    # frontend/src/lib/dashboardThemes.js for the preset catalog and the
    # full set of override keys (Text/Foreground/Accent colors plus the
    # "Advanced colors" set: Background, Secondary text, Inverse text,
    # Link text, Outline, Axes and rule, Input border, Header text/
    # foreground, Info/Success/Warning/Danger). NULL means "use the
    # default dark preset" — most dashboards never touch this.
    theme = Column(JSONB, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    # "private" (only the creator, plus Administrator+) | "organization"
    # (every org member — the default, matching the long-standing
    # behavior) | "public" (view-only, no login — not yet wired to an
    # actual public dashboard viewer; reserved for a future pass). See
    # core/visibility.py.
    visibility = Column(String, default="organization", nullable=False)
    # NULL = active. Set = in the trash — permanently purged 7 days
    # after deleted_at unless restored first. See core/trash.py and
    # routes/dashboards.py's trash_dashboard/restore_dashboard.
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    # {"preset": "all_time" | "last_7_days" | "last_30_days" | "last_90_days"
    # | "last_year" | "custom", "start": "2026-01-01", "end": "2026-02-01"}
    # (start/end only meaningful for "custom") — a dashboard-wide filter
    # applied on top of each widget's own filters, based on Record.created_at
    # (when it was submitted). NULL/absent = no filter, matching every
    # dashboard's behavior before this existed. See core/dashboard_engine.py's
    # apply_time_filter and routes/dashboards.py's get_dashboard_data. There
    # is deliberately no geographic "region" filter here — nothing in the
    # data model standardizes a region/state field across every survey to
    # filter by, so only the time half of "Time and region" is real.
    time_filter = Column(JSONB, nullable=True)
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

    `config` shape depends on `widget_type` (each Survey's FeatureLayer is
    what a widget binds to — see models/feature_layer.py):
      kpi:        {feature_layer_id, aggregation, field_key?, filters?}
      bar_chart / pie_chart:
                  {feature_layer_id, group_by_field_key, aggregation, value_field_key?, filters?}
      line_chart: {feature_layer_id, interval, aggregation, value_field_key?, filters?}
      table:      {feature_layer_id, field_keys, filters?, limit?}
      map:        {feature_layer_id?, filters?}   (feature_layer_id omitted = every layer)

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
