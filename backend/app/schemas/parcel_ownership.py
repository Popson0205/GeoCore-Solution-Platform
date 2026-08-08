import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

TRANSFER_TYPES = {"purchase", "inheritance", "gift", "court_order", "original_grant", "other"}


class OwnershipTransferRequest(BaseModel):
    owner_name: str
    owner_contact: Optional[str] = None
    transfer_type: str = "other"
    notes: Optional[str] = None
    acquired_date: Optional[date_type] = None
    land_record_id: Optional[uuid.UUID] = None

    @field_validator("transfer_type")
    @classmethod
    def validate_transfer_type(cls, value: str) -> str:
        if value not in TRANSFER_TYPES:
            raise ValueError(f"transfer_type must be one of {sorted(TRANSFER_TYPES)}")
        return value

    @field_validator("owner_name")
    @classmethod
    def validate_owner_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("owner_name is required")
        return value


class ParcelOwnershipOut(BaseModel):
    id: uuid.UUID
    record_id: uuid.UUID
    owner_name: str
    owner_contact: Optional[str] = None
    transfer_type: str
    notes: Optional[str] = None
    acquired_date: Optional[date_type] = None
    transferred_date: Optional[date_type] = None
    land_record_id: Optional[uuid.UUID] = None
    previous_ownership_id: Optional[uuid.UUID] = None
    created_at: datetime
    is_current: bool = False

    model_config = {"from_attributes": True}
