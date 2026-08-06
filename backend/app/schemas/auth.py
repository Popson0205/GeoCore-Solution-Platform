import uuid
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator, model_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    # "personal" (a single-seat account) or "organization" (invites/roles
    # enabled) — determines the plan on the Organisation created
    # alongside this user at registration (see routes/auth.py's
    # register). Matches the same "personal"/"organization" values
    # PurchaseLicense.jsx and Organisation.plan already use elsewhere.
    account_type: str = "personal"
    # Required when account_type is "organization" — becomes the new
    # Organisation's name. Ignored for "personal" (a workspace name is
    # generated automatically instead).
    organisation_name: Optional[str] = None

    @field_validator("account_type")
    @classmethod
    def validate_account_type(cls, value: str) -> str:
        if value not in ("personal", "organization"):
            raise ValueError('account_type must be "personal" or "organization"')
        return value

    @model_validator(mode="after")
    def require_org_name_for_organization(self) -> "UserCreate":
        if self.account_type == "organization" and not (self.organisation_name or "").strip():
            raise ValueError("organisation_name is required for an organization account")
        return self


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: Optional[str] = None
    is_platform_admin: bool = False

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
