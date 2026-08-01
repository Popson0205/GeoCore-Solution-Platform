import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Report(Base):
    """A generated project report (blueprint section 18: Reporting and
    Analytics). The PDF itself is streamed back at generation time; this row
    keeps a lightweight, re-readable history of what was generated and the
    summary numbers that went into it.
    """

    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # The tenancy boundary (Portal redesign Phase 2, this Phase 6) — Reports
    # centralize to Portal scope alongside Dashboards (see the 10-phase
    # plan's Phase 6 "Open question"). A report generated via the org-wide
    # route has project_id = NULL; one generated via the still-supported
    # project-scoped route keeps project_id set as an optional folder tag,
    # the same distinction Dashboard/Record make.
    organisation_id = Column(
        UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False, index=True
    )
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    title = Column(String, nullable=False)
    summary = Column(JSONB, default=dict, nullable=False)
    # A GeoAI-authored narrative (see core/geoai.py) walking through what
    # the data actually shows — survey structure, dashboard charts, and
    # field-level patterns — not just the raw counts in `summary`. NULL
    # when generated without the "GeoAI insights" option, or when no
    # ANTHROPIC_API_KEY is configured.
    ai_summary = Column(Text, nullable=True)
    generated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    organisation = relationship("Organisation")
    project = relationship("Project", backref="reports")
