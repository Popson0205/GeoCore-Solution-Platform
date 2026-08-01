import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

PLANS = {"personal", "organization"}
TIERS = {"basic", "pro", "enterprise", None}
DURATIONS = {"yearly", "perpetual"}
DEPLOYMENT_MODES = {"cloud", "on_prem"}


class CustomerCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    notes: Optional[str] = None


class CustomerOut(BaseModel):
    id: uuid.UUID
    customer_number: str
    name: str
    email: str
    phone: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LicenseIssueRequest(BaseModel):
    plan: str
    tier: Optional[str] = None
    # Integer seat count, or "unlimited". Forced to 1 server-side when
    # plan == "personal", same as the CLI (see scripts/issue_license.py).
    seats: str = "1"
    duration_type: str
    deployment_mode: str = "cloud"
    send_email: bool = True

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, value: str) -> str:
        if value not in PLANS:
            raise ValueError(f"plan must be one of {sorted(PLANS)}")
        return value

    @field_validator("tier")
    @classmethod
    def validate_tier(cls, value: Optional[str]) -> Optional[str]:
        if value not in TIERS:
            raise ValueError(f"tier must be one of {sorted(t for t in TIERS if t)}")
        return value

    @field_validator("duration_type")
    @classmethod
    def validate_duration(cls, value: str) -> str:
        if value not in DURATIONS:
            raise ValueError(f"duration_type must be one of {sorted(DURATIONS)}")
        return value

    @field_validator("deployment_mode")
    @classmethod
    def validate_deployment(cls, value: str) -> str:
        if value not in DEPLOYMENT_MODES:
            raise ValueError(f"deployment_mode must be one of {sorted(DEPLOYMENT_MODES)}")
        return value


class LicenseRecordOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    license_key: str
    plan: str
    tier: Optional[str] = None
    seat_limit: Optional[int] = None
    duration_type: str
    deployment_mode: str
    issued_at: datetime
    expires_at: Optional[datetime] = None
    status: str
    applied_organisation_id: Optional[uuid.UUID] = None
    sent_to_email: Optional[str] = None
    sent_at: Optional[datetime] = None
    email_sent: bool = False
    email_error: Optional[str] = None

    model_config = {"from_attributes": True}
