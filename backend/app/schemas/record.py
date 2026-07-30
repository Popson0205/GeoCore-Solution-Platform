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
    # Scope now lives on organisation_id/survey_id; project_id is an optional
    # folder tag (Portal redesign Phase 1).
    organisation_id: uuid.UUID
    survey_id: uuid.UUID
    asset_type_id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    geometry: dict
    field_data: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RecordListItem(BaseModel):
    """A record as returned by the organisation- and survey-wide listing
    endpoints. `geometry` is omitted by default to keep Portal-wide listings
    light (a record's GeoJSON can dwarf the rest of the row); it's only
    populated when the caller passes ?geometry=true — see routes/records.py.
    """

    id: uuid.UUID
    organisation_id: uuid.UUID
    survey_id: uuid.UUID
    asset_type_id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    geometry: Optional[dict] = None
    field_data: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ImportRowError(BaseModel):
    line: int
    message: str


class ImportSummary(BaseModel):
    """Result of POST /projects/{id}/records/import — a bulk import never
    aborts on the first bad row (blueprint section 2: this is meant to be
    the fix for "data is stuck in spreadsheets", so it needs to tolerate
    the messiness that implies). Every row is attempted independently;
    `errors` lists exactly which ones didn't make it and why.
    """

    total_rows: int
    created: int
    skipped: int
    errors: list[ImportRowError] = []
