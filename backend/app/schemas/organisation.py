import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

from backend.app.core.roles import ALL_ROLES


PLANS = {"personal", "organization"}


class OrganisationCreate(BaseModel):
    name: str
    # "personal" (single-seat — see models/organisation.py's docstring) or
    # "organization" (invite/roles enabled). Defaults to "organization" so
    # existing integrations that don't send this keep today's behavior.
    plan: str = "organization"

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, value: str) -> str:
        if value not in PLANS:
            raise ValueError(f"plan must be one of {sorted(PLANS)}")
        return value


class OrganisationOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    plan: str
    license_tier: Optional[str] = None
    seat_limit: Optional[int] = None
    license_expires_at: Optional[datetime] = None
    has_license: bool = False
    about_text: Optional[str] = None
    website_url: Optional[str] = None
    open_data_url: Optional[str] = None
    banner_image_url: Optional[str] = None
    custom_domain: Optional[str] = None
    estate_public_search_enabled: bool = False
    # The requesting user's role in this organisation. Populated per-request
    # in routes/organisations.py — not a DB column on Organisation itself.
    my_role: Optional[str] = None

    model_config = {"from_attributes": True}


class LicenseApply(BaseModel):
    license_key: str


class LicenseStatus(BaseModel):
    has_license: bool
    plan: str
    tier: Optional[str] = None
    seat_limit: Optional[int] = None
    seats_used: int
    expires_at: Optional[datetime] = None
    licensee_name: Optional[str] = None
    deployment_mode: Optional[str] = None


class ActivateLicenseRequest(BaseModel):
    license_key: str
    organisation_name: str


class OrganisationUpdate(BaseModel):
    """Organization settings — the ArcGIS-Online-style home page's "About
    Us" text and its two quick-link buttons (see
    pages/OrganisationOverview.jsx). Renaming the organisation itself isn't
    included here on purpose: `slug` is derived from `name` at creation and
    used in URLs/tokens elsewhere, so changing it is a bigger operation
    than this settings form is meant for.
    """

    about_text: Optional[str] = None
    website_url: Optional[str] = None
    open_data_url: Optional[str] = None
    # Purely a request captured for your ops team to act on — see
    # models/organisation.py's custom_domain docstring for why setting
    # this doesn't make the site reachable there by itself.
    custom_domain: Optional[str] = None


class MemberOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: EmailStr
    full_name: Optional[str] = None
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberInvite(BaseModel):
    """Adds an *already-registered* user to the organisation. This starter
    doesn't send invite emails yet — the person must have an account first.
    See docs/ARCHITECTURE.md for the email-invite flow to build next.
    """

    email: EmailStr
    role: str = "viewer"

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in ALL_ROLES:
            raise ValueError(f"role must be one of {ALL_ROLES}")
        return value


class MemberRoleUpdate(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in ALL_ROLES:
            raise ValueError(f"role must be one of {ALL_ROLES}")
        return value
