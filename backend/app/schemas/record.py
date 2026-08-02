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
    # The parent Survey now comes from the request path (records are nested
    # under a survey), so it's no longer part of the body — the old
    # asset_type_id is gone with the flat model.
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
    project_id: Optional[uuid.UUID] = None
    geometry: dict
    field_data: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RecordGeometryOut(BaseModel):
    """Slim shape for GET /organisations/{id}/records?geometry=true (Portal
    redesign Phase 2, this Phase 6) — a Portal-wide map needs geometry +
    just enough to style/filter a point, not every field_data value on
    every record, which gets expensive at Portal scale.
    """

    id: uuid.UUID
    survey_id: uuid.UUID
    geometry: dict

    model_config = {"from_attributes": True}


class ImportRowError(BaseModel):
    line: int
    message: str


class ImportPreviewOut(BaseModel):
    """The 'detect columns, then match them to fields' step before an
    actual import — see routes/feature_layers.py's preview_import. A
    user picks which detected column maps to which of the layer's real
    fields, so a genuine name mismatch (not just a formatting
    difference slugifying already handles) doesn't silently land the
    data under an untracked key.
    """

    columns: list[str]
    sample_rows: list[dict]
    fields: list[dict]
    suggested_mapping: dict[str, str]


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
