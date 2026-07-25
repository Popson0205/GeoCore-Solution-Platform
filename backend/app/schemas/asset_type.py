import re
import uuid
from typing import Optional

from pydantic import BaseModel, Field, field_validator

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


def slugify_key(label: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return key or "field"


class FieldDefinitionCreate(BaseModel):
    label: str
    field_type: str = "text"
    options: Optional[list[str]] = None
    is_required: bool = False
    sort_order: int = 0

    @field_validator("field_type")
    @classmethod
    def validate_field_type(cls, value: str) -> str:
        if value not in FIELD_TYPES:
            raise ValueError(f"field_type must be one of {sorted(FIELD_TYPES)}")
        return value


class FieldDefinitionOut(BaseModel):
    id: uuid.UUID
    label: str
    field_key: str
    field_type: str
    options: Optional[list[str]] = None
    is_required: bool
    sort_order: int

    model_config = {"from_attributes": True}


class AssetTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    geometry_type: str = "point"
    color: str = Field(default="#2563eb")
    fields: list[FieldDefinitionCreate] = []

    @field_validator("geometry_type")
    @classmethod
    def validate_geometry_type(cls, value: str) -> str:
        if value not in GEOMETRY_TYPES:
            raise ValueError(f"geometry_type must be one of {sorted(GEOMETRY_TYPES)}")
        return value


class AssetTypeOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: Optional[str] = None
    geometry_type: str
    color: str
    field_definitions: list[FieldDefinitionOut] = []

    model_config = {"from_attributes": True}
