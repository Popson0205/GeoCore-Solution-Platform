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
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.core import email as email_module
from backend.app.core import licensing
from backend.app.core.database import get_db
from backend.app.models.customer import Customer, License
from backend.app.models.organisation import Organisation, OrganisationMember
from backend.app.models.user import User
from backend.app.schemas.admin import (
    AdminStats,
    CustomerCreate,
    CustomerOut,
    CustomerUpdate,
    LicenseIssueRequest,
    LicenseRecordOut,
    LicenseWithCustomerOut,
    OrganisationAdminOut,
    PlatformAdminOut,
)

router = APIRouter()


def require_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_platform_admin:
        raise HTTPException(status_code=404, detail="Not found")
    return current_user


def _next_customer_number(db: Session) -> str:
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


def _license_out(lic: License, email_sent: bool = False, email_error: str | None = None) -> LicenseRecordOut:
    out = LicenseRecordOut.model_validate(lic)
    out.email_sent = email_sent
    out.email_error = email_error
    return out


@router.get("/stats", response_model=AdminStats)
def get_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    total_customers = db.query(Customer).count()
    leads = db.query(Customer).filter(Customer.status == "lead").count()
    licensed_customers = db.query(Customer).filter(Customer.status == "licensed").count()

    total_licenses_issued = db.query(License).count()
    revoked_licenses = db.query(License).filter(License.status == "revoked").count()

    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=30)
    active_licenses = (
        db.query(License)
        .filter(License.status != "revoked")
        .filter(or_(License.expires_at.is_(None), License.expires_at > now))
        .count()
    )
    expiring_within_30_days = (
        db.query(License)
        .filter(License.status != "revoked")
        .filter(License.expires_at.isnot(None))
        .filter(License.expires_at > now, License.expires_at <= soon)
        .count()
    )
    total_seats_licensed = (
        db.query(func.coalesce(func.sum(License.seat_limit), 0))
        .filter(License.status != "revoked")
        .filter(or_(License.expires_at.is_(None), License.expires_at > now))
        .filter(License.seat_limit.isnot(None))
        .scalar()
        or 0
    )

    total_organisations = db.query(Organisation).count()
    organisations_with_license = db.query(Organisation).filter(Organisation.license_key.isnot(None)).count()

    return AdminStats(
        total_customers=total_customers,
        leads=leads,
        licensed_customers=licensed_customers,
        total_licenses_issued=total_licenses_issued,
        active_licenses=active_licenses,
        expiring_within_30_days=expiring_within_30_days,
        revoked_licenses=revoked_licenses,
        total_organisations=total_organisations,
        organisations_with_license=organisations_with_license,
        total_seats_licensed=int(total_seats_licensed),
    )


@router.get("/platform-admins", response_model=list[PlatformAdminOut])
def list_platform_admins(
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    return db.query(User).filter(User.is_platform_admin.is_(True)).order_by(User.email).all()


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
    out = CustomerOut.model_validate(customer)
    out.license_count = 0
    return out


@router.get("/customers", response_model=list[CustomerOut])
def list_customers(
    search: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    query = db.query(Customer)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Customer.customer_number.ilike(like),
                Customer.name.ilike(like),
                Customer.email.ilike(like),
            )
        )
    if status:
        query = query.filter(Customer.status == status)

    customers = query.order_by(Customer.created_at.desc()).all()
    counts = dict(
        db.query(License.customer_id, func.count(License.id)).group_by(License.customer_id).all()
    )
    out = []
    for c in customers:
        row = CustomerOut.model_validate(c)
        row.license_count = counts.get(c.id, 0)
        out.append(row)
    return out


@router.get("/customers/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    out = CustomerOut.model_validate(customer)
    out.license_count = db.query(License).filter(License.customer_id == customer.id).count()
    return out


@router.patch("/customers/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if payload.name is not None:
        customer.name = payload.name
    if payload.email is not None:
        customer.email = payload.email
    if payload.phone is not None:
        customer.phone = payload.phone or None
    if payload.notes is not None:
        customer.notes = payload.notes or None
    if payload.status is not None:
        customer.status = payload.status

    db.commit()
    db.refresh(customer)
    out = CustomerOut.model_validate(customer)
    out.license_count = db.query(License).filter(License.customer_id == customer.id).count()
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


@router.get("/licenses", response_model=list[LicenseWithCustomerOut])
def list_all_licenses(
    status: str | None = None,
    plan: str | None = None,
    deployment_mode: str | None = None,
    expiring_soon: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    query = db.query(License, Customer).join(Customer, License.customer_id == Customer.id)
    if status:
        query = query.filter(License.status == status)
    if plan:
        query = query.filter(License.plan == plan)
    if deployment_mode:
        query = query.filter(License.deployment_mode == deployment_mode)
    if expiring_soon:
        now = datetime.now(timezone.utc)
        soon = now + timedelta(days=30)
        query = query.filter(License.status != "revoked")
        query = query.filter(License.expires_at.isnot(None))
        query = query.filter(License.expires_at > now, License.expires_at <= soon)

    rows = query.order_by(License.created_at.desc()).all()

    org_ids = [lic.applied_organisation_id for lic, _ in rows if lic.applied_organisation_id]
    org_names = {}
    if org_ids:
        org_names = dict(
            db.query(Organisation.id, Organisation.name).filter(Organisation.id.in_(org_ids)).all()
        )

    out = []
    for lic, customer in rows:
        base = LicenseRecordOut.model_validate(lic).model_dump()
        row = LicenseWithCustomerOut(
            **base,
            customer_number=customer.customer_number,
            customer_name=customer.name,
            applied_organisation_name=(
                org_names.get(lic.applied_organisation_id) if lic.applied_organisation_id else None
            ),
        )
        out.append(row)
    return out


@router.post("/licenses/{license_id}/revoke", response_model=LicenseRecordOut)
def revoke_license(
    license_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    lic = db.query(License).filter(License.id == license_id).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    lic.status = "revoked"
    db.commit()
    db.refresh(lic)
    return _license_out(lic)


@router.get("/organisations", response_model=list[OrganisationAdminOut])
def list_all_organisations(
    search: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    query = db.query(Organisation)
    if search:
        query = query.filter(Organisation.name.ilike(f"%{search.strip()}%"))
    orgs = query.order_by(Organisation.created_at.desc()).all()

    member_counts = dict(
        db.query(OrganisationMember.organisation_id, func.count(OrganisationMember.id))
        .group_by(OrganisationMember.organisation_id)
        .all()
    )

    return [
        OrganisationAdminOut(
            id=org.id,
            name=org.name,
            plan=org.plan,
            license_tier=org.license_tier,
            seat_limit=org.seat_limit,
            seats_used=member_counts.get(org.id, 0),
            license_expires_at=org.license_expires_at,
            has_license=bool(org.license_key),
            member_count=member_counts.get(org.id, 0),
            created_at=org.created_at,
        )
        for org in orgs
    ]
