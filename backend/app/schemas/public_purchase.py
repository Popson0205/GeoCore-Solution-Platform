from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator


class PurchaseRequestCreate(BaseModel):
    """The public "Purchase a license" form — no auth, no payment capture.
    This just gets the request in front of your team (see
    routes/public.py's submit_purchase_request); the actual invoice/
    payment conversation still happens manually, same as everything else
    in this licensing model.
    """

    name: str
    email: EmailStr
    phone: Optional[str] = None
    organisation_name: str
    plan: str
    tier: Optional[str] = None
    seats: str = "1"
    desired_domain: Optional[str] = None
    message: Optional[str] = None

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, value: str) -> str:
        if value not in {"personal", "organization"}:
            raise ValueError("plan must be 'personal' or 'organization'")
        return value


class PurchaseRequestReceipt(BaseModel):
    customer_number: str
    message: str = (
        "Thanks — we've received your request. Our team will confirm payment and email your "
        "license key once it's ready."
    )
