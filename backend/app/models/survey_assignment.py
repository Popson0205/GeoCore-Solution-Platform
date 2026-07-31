import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class SurveyAssignment(Base):
    """Optionally scopes a Data Collector's write access to specific
    Surveys within an organisation (Portal redesign Phase 9).

    Distinct from `SubmissionAssignee` (asset_type.py): that model is an
    email-only allowlist for the public, unauthenticated submission link;
    this model links a real GeoCore `User` to a `Survey` they're allowed
    to collect data against as an internal, logged-in Data Collector.

    Presence/absence is what drives the behaviour (see
    deps_project.require_survey_role): a Data Collector with zero rows
    anywhere in the organisation is unrestricted (their org role applies
    as before); as soon as they have at least one row, they're limited to
    exactly the surveys listed here. Roles above Data Collector are never
    restricted by this table.
    """

    __tablename__ = "survey_assignments"
    __table_args__ = (
        UniqueConstraint("survey_id", "user_id", name="uq_survey_assignment_survey_user"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_id = Column(
        UUID(as_uuid=True), ForeignKey("surveys.id"), nullable=False, index=True
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    survey = relationship("Survey", back_populates="scoped_assignments")
    user = relationship("User")
