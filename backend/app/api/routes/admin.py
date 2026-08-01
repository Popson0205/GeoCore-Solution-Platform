"""The Admin Portal — GeoCore's own team manages customers and issues
license keys here. Every route requires `current_user.is_platform_admin`
(see require_platform_admin below), a flag nobody ever gets through any
signup or invite flow — set directly in the database for your own staff
accounts. Regular customers, including organisation owners, never see or
reach these routes.

License issuance additionally requires `settings.license_private_key` to
be configured. That's deliberate: this router's code can exist in every
deployment without risk, because it's structurally inert without a
secret that only your team's own instance ever has (see
core/config.py's license_private_key docstring).
"""

import uuid
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives import serialization
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.core import email as email_module
from backend.app.core import licensing
from backend.app.core.database import get_db
from backend.app.models.customer import Customer, License
from backend.app.models.user import User
from backend.app.schemas.admin import (
    CustomerCreate,
    CustomerOut,
    LicenseIssueRequest,
    LicenseRecordOut,
)

router = APIRouter()


def require_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_platform_admin:
        # 404, not 403 — a regular customer probing this path shouldn't
        # even learn that an admin-only route exists here.
        raise HTTPException(status_code=404, detail="Not found")
    return current_user


def _next_customer_number(db: Session) -> str:
    """GC-000001, GC-000002, ... — sequential and human-readable enough
    to read over the phone to a customer. Derived from the current count
    rather than a dedicated sequence table; fine at the volume a manually-
    invoiced business does licensing at.
    """
    count = db.query(Customer).count()
    return f"GC-{count + 1:06d}"


def _private_key():
    from backend.app.core.config import settings

    if not settings.license_private_key:
        raise HTTPException(
            status_code=503,
            detail="This instance isn't configured to issue licenses (no LICENSE_PRIVATE_KEY set). "
            "That's expected on customer deployments — licenses are only issued from your team's "
            "own Admin Portal instance.",
        )
    try:
        return serialization.load_pem_private_key(
            settings.license_private_key.encode("utf-8"), password=None
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LICENSE_PRIVATE_KEY is malformed: {exc}")


@router.post("/customers", response_model=CustomerOut, status_code=201)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    customer = Customer(
        customer_number=_next_customer_number(db),
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        notes=payload.notes,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/customers", response_model=list[CustomerOut])
def list_customers(
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    return db.query(Customer).order_by(Customer.created_at.desc()).all()


@router.get("/customers/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


def _license_out(lic: License, email_sent: bool = False, email_error: str | None = None) -> LicenseRecordOut:
    out = LicenseRecordOut.model_validate(lic)
    out.email_sent = email_sent
    out.email_error = email_error
    return out


@router.get("/customers/{customer_id}/licenses", response_model=list[LicenseRecordOut])
def list_customer_licenses(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    licenses = (
        db.query(License)
        .filter(License.customer_id == customer_id)
        .order_by(License.created_at.desc())
        .all()
    )
    return [_license_out(lic) for lic in licenses]


@router.post("/customers/{customer_id}/licenses", response_model=LicenseRecordOut, status_code=201)
def issue_license(
    customer_id: uuid.UUID,
    payload: LicenseIssueRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    private_key = _private_key()

    if payload.plan == "personal":
        seat_limit = 1
    elif payload.seats.strip().lower() == "unlimited":
        seat_limit = None
    else:
        try:
            seat_limit = int(payload.seats)
        except ValueError:
            raise HTTPException(status_code=422, detail="seats must be an integer or 'unlimited'")

    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=365) if payload.duration_type == "yearly" else None
    )

    key = licensing.sign_license(
        licensee_name=customer.name,
        plan=payload.plan,
        tier=payload.tier,
        seat_limit=seat_limit,
        deployment_mode=payload.deployment_mode,
        expires_at=expires_at.date() if expires_at else None,
        private_key=private_key,
    )

    lic = License(
        customer_id=customer.id,
        license_key=key,
        plan=payload.plan,
        tier=payload.tier,
        seat_limit=seat_limit,
        duration_type=payload.duration_type,
        deployment_mode=payload.deployment_mode,
        expires_at=expires_at,
        status="issued",
        issued_by=current_user.id,
    )
    db.add(lic)
    db.commit()
    db.refresh(lic)

    email_sent = False
    email_error = None
    if payload.send_email:
        try:
            email_module.send_license_email(
                to_email=customer.email,
                customer_name=customer.name,
                license_key=key,
                plan=payload.plan,
                tier=payload.tier,
                seat_limit=seat_limit,
                duration_type=payload.duration_type,
                expires_at=expires_at.date().isoformat() if expires_at else None,
            )
            lic.sent_to_email = customer.email
            lic.sent_at = datetime.now(timezone.utc)
            db.commit()
            email_sent = True
        except email_module.EmailUnavailable as exc:
            email_error = str(exc)

    return _license_out(lic, email_sent=email_sent, email_error=email_error)


@router.post("/licenses/{license_id}/revoke", response_model=LicenseRecordOut)
def revoke_license(
    license_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    """Marks a license revoked in your own records, and blocks it from
    being (re-)applied to a cloud organisation going forward (see
    routes/organisations.py's apply_license). Cannot retroactively
    deactivate a copy of this key already applied on an on-prem instance
    with no network access back to you — that's an inherent limit of
    offline-verifiable licensing, not something this endpoint can fix.
    """
    lic = db.query(License).filter(License.id == license_id).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    lic.status = "revoked"
    db.commit()
    db.refresh(lic)
    return _license_out(lic)
