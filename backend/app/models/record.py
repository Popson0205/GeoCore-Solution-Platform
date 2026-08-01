import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Record(Base):
    """One filled-out Survey submission (blueprint section 10 & 11): a single
    Record == one completed form. Its `geometry` shape (point/line/polygon,
    or absent for a non-spatial survey) is dictated by the parent Survey's
    geometry_type now that the Survey owns the form directly (flat model).

    `geometry` is stored as a plain GeoJSON geometry object
    (e.g. {"type": "Point", "coordinates": [lon, lat]}) in a JSONB column.
    This is the same MVP convenience the rest of the starter package uses for
    table creation: it lets records/maps ship without a PostGIS extension
    and GeoAlchemy2 dependency, and can be migrated to a real
    `geometry(Geometry, 4326)` column + spatial index later without changing
    the API shape.
    """

    __tablename__ = "records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Denormalized tenancy anchor (Portal redesign Phase 1): copied from the
    # survey's organisation so Portal-wide record queries can filter by
    # organisation without joining up through survey -> project every time.
    organisation_id = Column(
        UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False, index=True
    )
    survey_id = Column(
        UUID(as_uuid=True), ForeignKey("surveys.id"), nullable=False, index=True
    )
    # Now just an optional folder tag, no longer the scope boundary — records
    # are scoped by organisation_id/survey_id instead (Portal redesign Phase 1).
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    geometry = Column(JSONB, nullable=False)
    # field_key -> value, keyed against the parent Survey's field_definitions
    field_data = Column(JSONB, default=dict, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    # Set instead of created_by when a record comes in through a public or
    # assigned submission link (routes/public.py) rather than from a
    # logged-in org member — there's no User row to point to for those.
    submitted_by_name = Column(String, nullable=True)
    submitted_by_email = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    organisation = relationship("Organisation")
    survey = relationship("Survey")
    project = relationship("Project", backref="records")
    attachments = relationship(
        "Attachment", back_populates="record", cascade="all, delete-orphan"
    )
