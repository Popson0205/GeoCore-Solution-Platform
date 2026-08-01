import re
import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from backend.app.core.slugify import slugify_key  # noqa: F401 — re-exported for existing importers
from backend.app.core.visibility import VISIBILITY_OPERATORS

# A survey moves through draft -> published, and is soft-archived (never
# hard-deleted) so already-collected field data is preserved. See
# routes/surveys.py and the Survey model.
SURVEY_STATUSES = {"draft", "published", "archived"}

# point | line | polygon for a spatial form, or "none" for a non-spatial
# survey (a plain questionnaire whose records carry no map geometry). Moved
# down onto the Survey from the retired AssetType (flat model).
GEOMETRY_TYPES = {"point", "line", "polygon", "none"}

FIELD_TYPES = {
    "text",
    "long_text",
    "number",
    "date",
    "datetime",
    "single_select",
    "multi_select",
    "boolean",
    "photo",
    "video",
    "file",
    "signature",
}

COMPARE_OPERATORS = {
    "equals",
    "not_equals",
    "greater_than",
    "less_than",
    "greater_or_equal",
    "less_or_equal",
}


# ---------------------------------------------------------------------------
# Skip logic (visibility) and validation rule shapes
# ---------------------------------------------------------------------------


class VisibilityCondition(BaseModel):
    field_key: str
    operator: str
    value: Any = None

    @field_validator("operator")
    @classmethod
    def validate_operator(cls, value: str) -> str:
        if value not in VISIBILITY_OPERATORS:
            raise ValueError(f"operator must be one of {sorted(VISIBILITY_OPERATORS)}")
        return value


class VisibilityRule(BaseModel):
    combinator: str = "all"
    conditions: list[VisibilityCondition] = []

    @field_validator("combinator")
    @classmethod
    def validate_combinator(cls, value: str) -> str:
        if value not in {"all", "any"}:
            raise ValueError("combinator must be 'all' or 'any'")
        return value


class CompareRule(BaseModel):
    field_key: str
    operator: str
    message: Optional[str] = None

    @field_validator("operator")
    @classmethod
    def validate_operator(cls, value: str) -> str:
        if value not in COMPARE_OPERATORS:
            raise ValueError(f"operator must be one of {sorted(COMPARE_OPERATORS)}")
        return value


class FieldValidationRule(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    pattern: Optional[str] = None
    compare: Optional[CompareRule] = None

    @field_validator("pattern")
    @classmethod
    def validate_pattern(cls, value: Optional[str]) -> Optional[str]:
        if value:
            try:
                re.compile(value)
            except re.error as exc:
                raise ValueError(f"pattern is not a valid regular expression: {exc}") from exc
        return value


# ---------------------------------------------------------------------------
# Fields
# ---------------------------------------------------------------------------


class FieldDefinitionCreate(BaseModel):
    label: str
    field_type: str = "text"
    options: Optional[list[str]] = None
    is_required: bool = False
    visibility: Optional[VisibilityRule] = None
    # An expression like "{width} * {depth}" — see core/expressions.py.
    # When set, this field is server-computed; is_required is ignored for it.
    calculation: Optional[str] = None
    validation: Optional[FieldValidationRule] = None
    # Only set by the XLSForm importer (core/xlsform.py), which needs the
    # resulting field_key to match the XLSForm `name` column so converted
    # relevant/calculation/constraint expressions (which reference that
    # name) still resolve correctly. The form builder UI never sends
    # this — it always derives field_key from the label.
    field_key: Optional[str] = None

    @field_validator("field_type")
    @classmethod
    def validate_field_type(cls, value: str) -> str:
        if value not in FIELD_TYPES:
            raise ValueError(f"field_type must be one of {sorted(FIELD_TYPES)}")
        return value

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("label cannot be blank")
        return value


class FieldDefinitionOut(BaseModel):
    id: uuid.UUID
    label: str
    field_key: str
    field_type: str
    options: Optional[list[str]] = None
    is_required: bool
    sort_order: int
    visibility: Optional[dict] = None
    calculation: Optional[str] = None
    validation: Optional[dict] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Sections (pages / repeat groups)
# ---------------------------------------------------------------------------


class FormSectionCreate(BaseModel):
    title: str
    description: Optional[str] = None
    repeatable: bool = False
    repeat_label: Optional[str] = None
    visibility: Optional[VisibilityRule] = None
    fields: list[FieldDefinitionCreate] = []

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title cannot be blank")
        return value


class FormSectionOut(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    section_key: str
    sort_order: int
    repeatable: bool
    repeat_label: Optional[str] = None
    visibility: Optional[dict] = None
    fields: list[FieldDefinitionOut] = []

    model_config = {"from_attributes": True}


class FormDefinition(BaseModel):
    """The full form body shared by survey creation and the "replace form"
    endpoint. `fields` is accepted as a legacy flat shortcut — if given with
    no `sections`, it's wrapped into a single "General" section.
    """

    sections: list[FormSectionCreate] = []
    fields: list[FieldDefinitionCreate] = []


# ---------------------------------------------------------------------------
# Surveys (the form itself — flat Survey123/KoBo model)
# ---------------------------------------------------------------------------


class SurveyCreate(BaseModel):
    title: str
    description: Optional[str] = None
    # Optional folder grouping. When omitted the survey lives directly under
    # the organisation. organisation_id is never taken from the client — it
    # comes from the path (see routes/surveys.py) so tenancy can't be spoofed.
    project_id: Optional[uuid.UUID] = None
    status: str = "draft"
    # The shape records collect ("none" = non-spatial form) and the map
    # styling colour — both moved down onto the Survey from the retired
    # AssetType (flat model).
    geometry_type: str = "point"
    color: str = Field(default="#2563eb")
    # The form body. `fields` is a legacy flat shortcut (see FormDefinition) —
    # kept so existing scripts against the old flat "fields" shape keep working.
    sections: list[FormSectionCreate] = []
    fields: list[FieldDefinitionCreate] = []

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title cannot be blank")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in SURVEY_STATUSES:
            raise ValueError(f"status must be one of {sorted(SURVEY_STATUSES)}")
        return value

    @field_validator("geometry_type")
    @classmethod
    def validate_geometry_type(cls, value: str) -> str:
        if value not in GEOMETRY_TYPES:
            raise ValueError(f"geometry_type must be one of {sorted(GEOMETRY_TYPES)}")
        return value


class SurveyUpdate(BaseModel):
    """Renaming or restyling a survey. Use the dedicated "replace form"
    endpoint (see FormDefinition) to change the form body itself —
    sections/fields are accepted here too, as an optional whole-form replace.
    """

    title: Optional[str] = None
    description: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    status: Optional[str] = None
    geometry_type: Optional[str] = None
    color: Optional[str] = None
    # None = leave the form untouched; a list (even empty) = replace it.
    sections: Optional[list[FormSectionCreate]] = None
    fields: Optional[list[FieldDefinitionCreate]] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("title cannot be blank")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in SURVEY_STATUSES:
            raise ValueError(f"status must be one of {sorted(SURVEY_STATUSES)}")
        return value

    @field_validator("geometry_type")
    @classmethod
    def validate_geometry_type(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in GEOMETRY_TYPES:
            raise ValueError(f"geometry_type must be one of {sorted(GEOMETRY_TYPES)}")
        return value


class SurveyOut(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    title: str
    description: Optional[str] = None
    status: str
    geometry_type: str
    color: str
    # The token itself is a credential and is only ever exposed through a
    # dedicated submission-link endpoint (mirrors ProjectShareOut), never in
    # the general read model.
    submission_enabled: bool = False
    submission_access: str = "org"
    created_at: datetime
    sections: list[FormSectionOut] = []
    # Every field across every section, flattened — kept for consumers that
    # just want a simple list (e.g. the map popup, or a dashboard widget
    # picking a field to chart).
    field_definitions: list[FieldDefinitionOut] = []
    # Attached by routes/surveys.py at read time (not a mapped column) —
    # how many Records have been submitted against this Survey so far.
    # Used by the Survey gallery card (Records: N badge) and anywhere else
    # that wants a quick sense of a survey's activity without a separate
    # records query.
    record_count: int = 0

    model_config = {"from_attributes": True}


class XLSFormImportResult(BaseModel):
    survey: SurveyOut
    warnings: list[str] = []


# ---------------------------------------------------------------------------
# Submission links (public / assigned data collection — blueprint section 7)
# ---------------------------------------------------------------------------

SUBMISSION_ACCESS_MODES = {"org", "public", "assigned"}


class AssigneeCreate(BaseModel):
    email: str
    name: Optional[str] = None


class AssigneeOut(BaseModel):
    id: uuid.UUID
    email: str
    name: Optional[str] = None

    model_config = {"from_attributes": True}


class SubmissionEnableRequest(BaseModel):
    access: str = "public"

    @field_validator("access")
    @classmethod
    def validate_access(cls, value: str) -> str:
        if value not in ("public", "assigned"):
            raise ValueError("access must be 'public' or 'assigned'")
        return value


class SubmissionStatusOut(BaseModel):
    enabled: bool
    access: str
    token: Optional[str] = None
    public_path: Optional[str] = None
    assignees: list[AssigneeOut] = []


class PublicSubmitSchema(BaseModel):
    """What the public submission page needs to render the form — no
    project/organisation internals beyond the survey's own title/color.
    """

    project_name: str
    access: str
    survey: SurveyOut


class PublicSubmitRequest(BaseModel):
    submitter_name: Optional[str] = None
    submitter_email: Optional[str] = None
    geometry: dict
    field_data: dict[str, Any] = {}


class PublicSubmitReceipt(BaseModel):
    id: uuid.UUID
    submitted_at: Any

