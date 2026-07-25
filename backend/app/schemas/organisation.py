import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

from backend.app.core.roles import ALL_ROLES


class OrganisationCreate(BaseModel):
    name: str


class OrganisationOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    # The requesting user's role in this organisation. Populated per-request
    # in routes/organisations.py — not a DB column on Organisation itself.
    my_role: Optional[str] = None

    model_config = {"from_attributes": True}


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
