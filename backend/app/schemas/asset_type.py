import re
import uuid
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from backend.app.core.visibility import VISIBILITY_OPERATORS

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

GEOMETRY_TYPES = {"point", "line", "polygon"}

COMPARE_OPERATORS = {
    "equals",
    "not_equals",
    "greater_than",
    "less_than",
    "greater_or_equal",
    "less_or_equal",
}


def slugify_key(label: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return key or "field"


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
    """The full form body shared by asset-type creation and the "replace
    form" endpoint. `fields` is accepted as a legacy flat shortcut — if
    given with no `sections`, it's wrapped into a single "General" section.
    """

    sections: list[FormSectionCreate] = []
    fields: list[FieldDefinitionCreate] = []


# ---------------------------------------------------------------------------
# Asset types
# ---------------------------------------------------------------------------


class AssetTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    geometry_type: str = "point"
    color: str = Field(default="#2563eb")
    sections: list[FormSectionCreate] = []
    # Legacy flat shortcut (see FormDefinition) — kept so any existing
    # scripts/integrations against the old flat "fields" shape keep working.
    fields: list[FieldDefinitionCreate] = []

    @field_validator("geometry_type")
    @classmethod
    def validate_geometry_type(cls, value: str) -> str:
        if value not in GEOMETRY_TYPES:
            raise ValueError(f"geometry_type must be one of {sorted(GEOMETRY_TYPES)}")
        return value


class AssetTypeUpdate(BaseModel):
    """Renaming or restyling an asset type. Use PUT /asset-types/{id}/form
    to change the form itself (sections/fields) — see FormDefinition.
    """

    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("name cannot be blank")
        return value


class AssetTypeOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: Optional[str] = None
    geometry_type: str
    color: str
    sections: list[FormSectionOut] = []
    # Every field across every section, flattened into section-then-field
    # order — kept for consumers that just want a simple list (e.g. the
    # map popup, or a dashboard widget picking a field to chart).
    field_definitions: list[FieldDefinitionOut] = []

    model_config = {"from_attributes": True}


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
    project/organisation internals beyond the asset type's own name/color.
    """

    project_name: str
    access: str
    asset_type: AssetTypeOut


class PublicSubmitRequest(BaseModel):
    submitter_name: Optional[str] = None
    submitter_email: Optional[str] = None
    geometry: dict
    field_data: dict[str, Any] = {}


class PublicSubmitReceipt(BaseModel):
    id: uuid.UUID
    submitted_at: Any
