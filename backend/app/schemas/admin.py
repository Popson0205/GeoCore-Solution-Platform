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


class CustomerUpdate(BaseModel):
    """Editing an existing CRM record. `email` is intentionally editable
    too (people's addresses change) — it's just used for de-duping a
    public purchase-request submission against an existing lead, not as
    an immutable identifier anywhere.
    """

    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in {"lead", "licensed"}:
            raise ValueError("status must be 'lead' or 'licensed'")
        return value


class CustomerOut(BaseModel):
    id: uuid.UUID
    customer_number: str
    name: str
    email: str
    phone: Optional[str] = None
    notes: Optional[str] = None
    status: str
    requested_plan: Optional[str] = None
    requested_tier: Optional[str] = None
    requested_seats: Optional[str] = None
    requested_organisation_name: Optional[str] = None
    desired_domain: Optional[str] = None
    created_at: datetime
    # Populated in routes/admin.py at read time — how many licenses this
    # customer has, so the Customers list can show it without a second
    # round-trip per row.
    license_count: int = 0

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


class LicenseWithCustomerOut(LicenseRecordOut):
    """Same shape as LicenseRecordOut, plus enough of the parent customer
    to render a useful row in the platform-wide Licenses view without a
    second lookup per row.
    """

    customer_number: str
    customer_name: str
    applied_organisation_name: Optional[str] = None


class AdminStats(BaseModel):
    """The Admin Portal's Overview tab — a snapshot of the whole
    business, not any one customer.
    """

    total_customers: int
    leads: int
    licensed_customers: int
    total_licenses_issued: int
    active_licenses: int
    expiring_within_30_days: int
    revoked_licenses: int
    total_organisations: int
    organisations_with_license: int
    total_seats_licensed: int  # sum of finite seat_limits across active licenses; unlimited licenses don't add a finite number here


class OrganisationAdminOut(BaseModel):
    """One row in the Admin Portal's Organisations view — every
    organisation on the platform, regardless of which customer (if any)
    it's tied to. Useful for "who is actually running on this instance
    right now" oversight, distinct from the Customers view (which is
    about billing relationships, not live usage).
    """

    id: uuid.UUID
    name: str
    plan: str
    license_tier: Optional[str] = None
    seat_limit: Optional[int] = None
    seats_used: int
    license_expires_at: Optional[datetime] = None
    has_license: bool
    member_count: int
    created_at: datetime


class PlatformAdminOut(BaseModel):
    """Read-only visibility into who currently has Admin Portal access.
    There is deliberately no endpoint to grant/revoke this here — see
    models/user.py's is_platform_admin docstring for why that stays a
    direct-database action.
    """

    id: uuid.UUID
    email: str
    full_name: Optional[str] = None
