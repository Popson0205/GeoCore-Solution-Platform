import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class FeatureLayer(Base):
    """The data source a Survey's form writes into — created automatically
    alongside a Survey (see routes/surveys.py's create_survey) as a
    genuinely separate row, the way ArcGIS Survey123 creates a Form item
    and a Feature Layer item together rather than one thing. A Survey
    defines *what questions get asked*; a FeatureLayer holds *the answers
    that came back*, and is what a Dashboard's map/chart widgets or a
    standalone Map actually bind to as their data source.

    One-to-one with its originating Survey (`survey_id` is unique) — this
    is deliberately NOT a many-to-many the way "Add a layer" implies in
    some GIS tools; a Survey and its Feature Layer are twins created and
    retired together. `geometry_type` and `color` live here now (moved
    down from Survey, which still has legacy columns of the same name
    kept only for backward compatibility — see models/survey.py) because
    they describe the *data*, not the *form*.
    """

    __tablename__ = "feature_layers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(
        UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False, index=True
    )
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    survey_id = Column(
        UUID(as_uuid=True), ForeignKey("surveys.id"), nullable=False, unique=True, index=True
    )
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    geometry_type = Column(String, default="point", nullable=False)
    color = Column(String, default="#0079c1", nullable=False)
    # A separate, read-only sharing mechanism from the Survey's own
    # *submission* link (which lets someone add data). This one lets
    # someone view/export the collected data itself — mirrors Project's
    # existing share_token/share_enabled pattern (see routes/projects.py).
    share_enabled = Column(Boolean, default=False, nullable=False)
    share_token = Column(String, unique=True, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    organisation = relationship("Organisation")
    project = relationship("Project")
    survey = relationship("Survey", back_populates="feature_layer")
    records = relationship("Record", back_populates="feature_layer")
