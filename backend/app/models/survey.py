import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Survey(Base):
    """A single Survey123/KoBo-style form (GeoCore Portal redesign — flat
    data model). A Survey *is* the form: it directly owns its FormSections
    and FieldDefinitions and carries its own geometry type, rather than
    delegating those to a child AssetType "feature layer". The old
    Survey -> AssetType -> form layering has been collapsed so that one
    Survey == one form == one thing a data collector fills out.

    The real tenancy anchor is `organisation_id` (NOT NULL). `project_id` is
    now only an optional folder-style grouping — a Survey can live directly
    under an organisation with no Project at all.

    `geometry_type` is what shape each Record collects: point | line |
    polygon, or "none" for a non-spatial form (a plain questionnaire with no
    map geometry). `color` (moved up from the retired AssetType) is the map
    styling colour for this survey's records.

    The shareable *submission* link (token/enabled/access) lives here:
    sharing is a property of the survey being collected. See routes/public.py's
    /public/submit/* endpoints. submission_access is "public" (anyone with the
    link, no login), "assigned" (only emails in `assignees`), or "org" (the
    default — internal members only, link unused).
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
    # LEGACY — superseded by FeatureLayer.geometry_type/color (see
    # models/feature_layer.py). Kept as columns rather than dropped to
    # avoid a destructive migration on a live database; nothing new reads
    # these two fields going forward. Every Survey has exactly one
    # FeatureLayer (created alongside it — see routes/surveys.py), which
    # is the actual source of truth for a survey's geometry/color now.
    geometry_type = Column(String, default="point", nullable=False)
    color = Column(String, default="#2563eb", nullable=False)
    # draft | published | archived. Deleting a Survey soft-archives it
    # (status = "archived") rather than cascade-deleting collected records —
    # see routes/surveys.py.
    status = Column(String, default="draft", nullable=False)
    submission_token = Column(String, unique=True, nullable=True, index=True)
    submission_enabled = Column(Boolean, default=False, nullable=False)
    submission_access = Column(String, default="org", nullable=False)
    # "private" (only the creator, plus Administrator+) | "organization"
    # (every member — the long-standing default, unchanged) | "public"
    # (anyone with a link can view the *form itself*, no login — distinct
    # from submission_access above, which is about *submitting data*, not
    # viewing/opening the survey). See core/visibility.py for the shared
    # enforcement helper used across Survey/FeatureLayer/Dashboard.
    visibility = Column(String, default="organization", nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    organisation = relationship("Organisation")
    project = relationship("Project")
    creator = relationship("User")
    # One-to-one — see models/feature_layer.py's docstring for why this
    # isn't a list.
    feature_layer = relationship(
        "FeatureLayer", back_populates="survey", uselist=False, cascade="all, delete-orphan"
    )
    # The form itself now hangs directly off the Survey (was AssetType).
    sections = relationship(
        "FormSection",
        back_populates="survey",
        cascade="all, delete-orphan",
        order_by="FormSection.sort_order",
    )
    # Every field across every section, for consumers that just need a flat
    # list (e.g. the map popup). Order here is whatever the DB returns it in —
    # routes build a properly section-ordered flat list for API responses;
    # don't rely on this relationship's order.
    field_definitions = relationship(
        "FieldDefinition",
        back_populates="survey",
        cascade="all, delete-orphan",
    )
    assignees = relationship(
        "SubmissionAssignee", back_populates="survey", cascade="all, delete-orphan"
    )
    # Per-survey Data Collector scoping (Portal redesign Phase 9) — see
    # models/survey_assignment.py for how presence/absence of rows here
    # changes a Data Collector's write access.
    scoped_assignments = relationship(
        "SurveyAssignment", back_populates="survey", cascade="all, delete-orphan"
    )


class FormSection(Base):
    """A page/group of fields within a survey's form (blueprint section 12).
    A section marked `repeatable` becomes a repeat group — Survey123 calls
    this a "repeat", ODK calls it a "group ... repeat" — e.g. "Add another
    inspector". Its answers are stored as a list of instances under
    `section_key` in a record's field_data, rather than as flat fields.

    Re-pointed from asset_type to survey (flat model): a section belongs
    directly to the Survey now that the Survey is the form.
    """

    __tablename__ = "form_sections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_id = Column(UUID(as_uuid=True), ForeignKey("surveys.id"), nullable=False)
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

    survey = relationship("Survey", back_populates="sections")
    fields = relationship(
        "FieldDefinition",
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="FieldDefinition.sort_order",
    )


class FieldDefinition(Base):
    """A configurable field on a survey's form (blueprint section 12).

    Re-pointed from asset_type to survey (flat model): a field belongs
    directly to the Survey now that the Survey is the form.
    """

    __tablename__ = "field_definitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_id = Column(UUID(as_uuid=True), ForeignKey("surveys.id"), nullable=False)
    section_id = Column(UUID(as_uuid=True), ForeignKey("form_sections.id"), nullable=True)
    label = Column(String, nullable=False)
    # url/json-safe key used inside a record's field_data, derived from label.
    # Unique across the whole survey (including fields inside repeat sections)
    # so calculations/visibility rules can reference it unambiguously.
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

    survey = relationship("Survey", back_populates="field_definitions")
    section = relationship("FormSection", back_populates="fields")


class SubmissionAssignee(Base):
    """One person allowed to submit via a Survey's "assigned" access
    submission link (blueprint section 7 — the "assigned" half of
    public/assigned sharing). Not a GeoCore User — no password, no org
    membership, just an email checked against on submit. See
    routes/public.py's public_submit_record.
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

