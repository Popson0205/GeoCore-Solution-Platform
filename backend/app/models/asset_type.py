import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class AssetType(Base):
    """A reusable, user-defined category of spatial data (blueprint section 11:
    Dynamic Geospatial Data Model). e.g. Drainage, School, Borehole, Road.

    Its form (what's actually collected) is made of FormSections, each
    holding one or more FieldDefinitions — this is the "form builder" layer
    described in blueprint section 12.
    """

    __tablename__ = "asset_types"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Re-pointed from project_id to survey_id (Portal redesign Phase 1): an
    # AssetType is a feature layer *within* a Survey, and it's the Survey
    # (not the AssetType) that now carries the organisation and the optional
    # project folder association.
    survey_id = Column(
        UUID(as_uuid=True), ForeignKey("surveys.id"), nullable=False, index=True
    )
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # point | line | polygon
    geometry_type = Column(String, default="point", nullable=False)
    color = Column(String, default="#2563eb", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # The submission link (token/enabled/access) and its assignees moved up
    # to the Survey (Portal redesign Phase 1) — sharing is a property of the
    # survey being collected, not of an individual feature layer.
    survey = relationship("Survey", back_populates="asset_types")
    sections = relationship(
        "FormSection",
        back_populates="asset_type",
        cascade="all, delete-orphan",
        order_by="FormSection.sort_order",
    )
    # Every field across every section, for consumers that just need a flat
    # list (e.g. the map popup). Order here is whatever the DB returns it
    # in — routes/asset_types.py builds a properly section-ordered flat
    # list for API responses; don't rely on this relationship's order.
    field_definitions = relationship(
        "FieldDefinition",
        back_populates="asset_type",
        cascade="all, delete-orphan",
    )


class FormSection(Base):
    """A page/group of fields within an asset type's form (blueprint section
    12). A section marked `repeatable` becomes a repeat group — Survey123
    calls this a "repeat", ODK calls it a "group ... repeat" — e.g. "Add
    another inspector". Its answers are stored as a list of instances under
    `section_key` in a record's field_data, rather than as flat fields.
    """

    __tablename__ = "form_sections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_type_id = Column(UUID(as_uuid=True), ForeignKey("asset_types.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # url/json-safe key used as the field_data key for a repeatable
    # section's list of instances. Unused for non-repeatable sections.
    section_key = Column(String, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    repeatable = Column(Boolean, default=False, nullable=False)
    repeat_label = Column(String, nullable=True)
    # Skip logic for the whole section — {"combinator": "all"|"any",
    # "conditions": [...]}. See backend/app/core/visibility.py.
    visibility = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    asset_type = relationship("AssetType", back_populates="sections")
    fields = relationship(
        "FieldDefinition",
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="FieldDefinition.sort_order",
    )


class FieldDefinition(Base):
    """A configurable field on an asset type's form (blueprint section 12)."""

    __tablename__ = "field_definitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_type_id = Column(UUID(as_uuid=True), ForeignKey("asset_types.id"), nullable=False)
    section_id = Column(UUID(as_uuid=True), ForeignKey("form_sections.id"), nullable=True)
    label = Column(String, nullable=False)
    # url/json-safe key used inside a record's field_data, derived from label.
    # Unique across the whole asset type (including fields inside repeat
    # sections) so calculations/visibility rules can reference it unambiguously.
    field_key = Column(String, nullable=False)
    # text | long_text | number | date | datetime | single_select | multi_select
    # | boolean | photo | video | file | signature
    field_type = Column(String, nullable=False, default="text")
    # choices for single_select / multi_select, stored as a list of strings
    options = Column(JSONB, nullable=True)
    is_required = Column(Boolean, default=False, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    # Skip logic for this one field — same shape as FormSection.visibility.
    visibility = Column(JSONB, nullable=True)
    # An arithmetic expression like "{width} * {depth}" (see
    # backend/app/core/expressions.py). When set, this field is
    # read-only/derived: the server recomputes it from the *other*
    # submitted values on every submission rather than trusting the
    # client-sent value, and it's never subject to required/validation
    # checks itself.
    calculation = Column(String, nullable=True)
    # {"min", "max", "min_length", "max_length", "pattern", "compare":
    # {"field_key", "operator", "message"}} — all optional. See
    # backend/app/core/form_engine.py.
    validation = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    asset_type = relationship("AssetType", back_populates="field_definitions")
    section = relationship("FormSection", back_populates="fields")


class SubmissionAssignee(Base):
    """One person allowed to submit via a Survey's "assigned" access
    submission link (blueprint section 7 — the "assigned" half of
    public/assigned sharing). Not a GeoCore User — no password, no org
    membership, just an email checked against on submit. See
    routes/public.py's public_submit_record. Re-pointed from asset_type to
    survey in Portal redesign Phase 1, following the submission link.
    """

    __tablename__ = "submission_assignees"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_id = Column(
        UUID(as_uuid=True), ForeignKey("surveys.id"), nullable=False, index=True
    )
    email = Column(String, nullable=False)
    name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    survey = relationship("Survey", back_populates="assignees")
