import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

GEOMETRY_TYPES = {"point", "line", "polygon", "none"}


class FeatureLayerOut(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    survey_id: uuid.UUID
    name: str
    description: Optional[str] = None
    geometry_type: str
    color: str
    # "private" | "organization" | "public" — see core/content_visibility.py.
    visibility: str = "organization"
    share_token: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Attached at read time (not a mapped column) — see
    # routes/feature_layers.py. Lets a Content-page row or a picker show
    # activity without a separate records query per item.
    record_count: int = 0
    survey_title: Optional[str] = None
    project_name: Optional[str] = None

    model_config = {"from_attributes": True}


class FeatureLayerUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    geometry_type: Optional[str] = None
    color: Optional[str] = None
    visibility: Optional[str] = None

    @field_validator("geometry_type")
    @classmethod
    def validate_geometry_type(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in GEOMETRY_TYPES:
            raise ValueError(f"geometry_type must be one of {sorted(GEOMETRY_TYPES)}")
        return value

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in {"private", "organization", "public"}:
            raise ValueError("visibility must be one of ['private', 'organization', 'public']")
        return value


class FeatureLayerShareStatus(BaseModel):
    """The public-link half of "public" visibility — a layer can be
    visibility="public" and still have no share_token generated yet
    (that only happens once someone actually turns the link on).
    """

    enabled: bool
    token: Optional[str] = None
    public_path: Optional[str] = None


class FeatureLayerUsageOut(BaseModel):
    """One Dashboard using this layer — the "what depends on this data"
    view (see routes/feature_layers.py's get_usage). Only dashboards the
    caller can actually see are included, same visibility rule as
    everywhere else.
    """

    dashboard_id: uuid.UUID
    dashboard_name: str
    widget_count: int
