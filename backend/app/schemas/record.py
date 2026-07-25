import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator

GEOJSON_TYPES = {"Point", "LineString", "Polygon"}


class Geometry(BaseModel):
    type: str
    coordinates: Any

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        if value not in GEOJSON_TYPES:
            raise ValueError(f"geometry type must be one of {sorted(GEOJSON_TYPES)}")
        return value


class RecordCreate(BaseModel):
    asset_type_id: uuid.UUID
    geometry: Geometry
    field_data: dict[str, Any] = {}


class RecordUpdate(BaseModel):
    geometry: Optional[Geometry] = None
    field_data: Optional[dict[str, Any]] = None


class RecordOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    asset_type_id: uuid.UUID
    geometry: dict
    field_data: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
