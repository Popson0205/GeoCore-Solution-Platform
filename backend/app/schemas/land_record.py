import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

RECORD_TYPES = {"deed", "plat", "subdivision_plan", "survey", "court_order", "other"}


class LandRecordCreate(BaseModel):
    project_id: Optional[uuid.UUID] = None
    record_type: str
    record_number: Optional[str] = None
    record_date: Optional[date_type] = None
    description: Optional[str] = None

    @field_validator("record_type")
    @classmethod
    def validate_record_type(cls, value: str) -> str:
        if value not in RECORD_TYPES:
            raise ValueError(f"record_type must be one of {sorted(RECORD_TYPES)}")
        return value


class LandRecordUpdate(BaseModel):
    record_type: Optional[str] = None
    record_number: Optional[str] = None
    record_date: Optional[date_type] = None
    description: Optional[str] = None

    @field_validator("record_type")
    @classmethod
    def validate_record_type(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in RECORD_TYPES:
            raise ValueError(f"record_type must be one of {sorted(RECORD_TYPES)}")
        return value


class LandRecordOut(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    record_type: str
    record_number: Optional[str] = None
    record_date: Optional[date_type] = None
    description: Optional[str] = None
    document_file_name: Optional[str] = None
    document_content_type: Optional[str] = None
    document_size_bytes: Optional[int] = None
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    # Computed at read time (not a mapped column) — how many parcels this
    # document created or retired. See routes/land_records.py.
    parcel_count: int = 0

    model_config = {"from_attributes": True}
