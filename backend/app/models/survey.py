import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Survey(Base):
    """A container that groups one or more AssetTypes (feature layers) into a
    single data-collection effort (GeoCore Portal Architecture Redesign,
    Phase 1). It sits *above* AssetType: an AssetType is still the atomic
    "feature layer" (what's actually collected), while a Survey is the
    campaign/dataset those layers belong to.

    The real tenancy anchor is `organisation_id` (NOT NULL). `project_id` is
    now only an optional folder-style grouping — a Survey can live directly
    under an organisation with no Project at all.

    The shareable *submission* link (token/enabled/access) moved up here from
    AssetType: sharing is a property of the survey being collected, not of an
    individual feature layer. See routes/public.py's /public/submit/*
    endpoints. submission_access is "public" (anyone with the link, no
    login), "assigned" (only emails in `assignees`), or "org" (the default —
    internal members only, link unused).
    """

    __tablename__ = "surveys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # The tenancy boundary. Every access check resolves through this rather
    # than through the (optional) project — see deps_project.require_survey_role.
    organisation_id = Column(
        UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False, index=True
    )
    # Optional folder grouping. Nullable: a Survey may sit directly under the
    # organisation with no Project.
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # draft | published | archived. Deleting a Survey soft-archives it
    # (status = "archived") rather than cascade-deleting collected records —
    # see routes/surveys.py.
    status = Column(String, default="draft", nullable=False)
    submission_token = Column(String, unique=True, nullable=True, index=True)
    submission_enabled = Column(Boolean, default=False, nullable=False)
    submission_access = Column(String, default="org", nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    organisation = relationship("Organisation")
    project = relationship("Project")
    creator = relationship("User")
    asset_types = relationship(
        "AssetType", back_populates="survey", cascade="all, delete-orphan"
    )
    assignees = relationship(
        "SubmissionAssignee", back_populates="survey", cascade="all, delete-orphan"
    )

