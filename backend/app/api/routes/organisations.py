import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import get_membership, require_org_role
from backend.app.core import licensing
from backend.app.core.audit import log_action
from backend.app.core.database import get_db
from backend.app.core.rate_limit import get_client_ip
from backend.app.core.roles import ADMINISTRATOR, OWNER
from backend.app.core.storage import resolve_upload, save_upload
from backend.app.models.audit_log import AuditLog
from backend.app.models.customer import Customer, License as LicenseRecord
from backend.app.models.organisation import Organisation, OrganisationMember
from backend.app.models.user import User
from backend.app.schemas.audit import AuditLogOut
from backend.app.schemas.organisation import (
    ActivateLicenseRequest,
    LicenseApply,
    LicenseStatus,
    MemberInvite,
    MemberOut,
    MemberRoleUpdate,
    OrganisationCreate,
    OrganisationOut,
    OrganisationUpdate,
)

router = APIRouter()


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or uuid.uuid4().hex[:8]


def _to_out(org: Organisation, my_role: str | None) -> OrganisationOut:
    out = OrganisationOut.model_validate(org)
    out.my_role = my_role
    out.has_license = bool(org.license_key)
    out.banner_image_url = f"/api/organisations/{org.id}/branding/banner" if org.banner_image_path else None
    return out


@router.post("/", response_model=OrganisationOut, status_code=201)
def create_organisation(
    payload: OrganisationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Creates an empty, unlicensed organisation — kept for admin tooling
    and edge cases, but this is deliberately NOT the primary onboarding
    path any more. A real customer's organisation now comes into
    existence via `POST /activate-license` below, as a side effect of
    activating a license key they were actually issued — there's no
    "just click New organisation" self-serve flow on the frontend any
    more. An org created here still can't create anything (see
    deps_project.require_active_license) until a license is applied.
    """
    # Guarantee a unique, URL-friendly slug even if names collide.
    base_slug = _slugify(payload.name)
    slug = base_slug
    counter = 1
    while db.query(Organisation).filter(Organisation.slug == slug).first():
        counter += 1
        slug = f"{base_slug}-{counter}"

    org = Organisation(name=payload.name, slug=slug, plan=payload.plan)
    db.add(org)
    db.flush()

    # Creator becomes the organisation owner (see blueprint section 13: User Roles).
    db.add(OrganisationMember(organisation_id=org.id, user_id=current_user.id, role=OWNER))
    db.commit()
    db.refresh(org)
    return _to_out(org, OWNER)


@router.post("/activate-license", response_model=OrganisationOut, status_code=201)
def activate_license(
    payload: ActivateLicenseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The real onboarding front door: a customer who's received a
    license key (via the public purchase-request form -> your team
    confirming payment -> the Admin Portal emailing them the key) comes
    here to redeem it. Creates a brand-new Organisation, makes the
    current user its owner, and applies the license to it in one step —
    there's no separate "create an organisation" click involved. Each
    license key can only activate one organisation: once verify_license
    succeeds here, the same checks routes/admin.py's revoke path relies
    on (the licenses table) apply, so a key already tied to a different
    organisation can't be reused to spin up a second one for free.
    """
    try:
        claims = licensing.verify_license(payload.license_key)
    except licensing.LicenseError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    existing_org = db.query(Organisation).filter(Organisation.license_key == payload.license_key).first()
    if existing_org:
        raise HTTPException(
            status_code=422,
            detail="This license key has already been activated on another organisation.",
        )

    record = db.query(LicenseRecord).filter(LicenseRecord.license_key == payload.license_key).first()
    if record and record.status == "revoked":
        raise HTTPException(status_code=422, detail="This license key has been revoked.")

    base_slug = _slugify(payload.organisation_name)
    slug = base_slug
    counter = 1
    while db.query(Organisation).filter(Organisation.slug == slug).first():
        counter += 1
        slug = f"{base_slug}-{counter}"

    org = Organisation(
        name=payload.organisation_name,
        slug=slug,
        plan=claims["plan"],
        license_key=payload.license_key,
        license_tier=claims.get("tier"),
        seat_limit=claims.get("seat_limit"),
        license_expires_at=datetime.fromisoformat(claims["expires_at"]) if claims.get("expires_at") else None,
    )
    db.add(org)
    db.flush()
    db.add(OrganisationMember(organisation_id=org.id, user_id=current_user.id, role=OWNER))

    if record:
        record.status = "applied"
        record.applied_organisation_id = org.id
        # Link the CRM record too, so the Admin Portal shows this lead as
        # onboarded rather than still sitting in the "lead" queue.
        customer = db.query(Customer).filter(Customer.id == record.customer_id).first()
        if customer:
            customer.status = "licensed"

    db.commit()
    db.refresh(org)
    return _to_out(org, OWNER)


@router.get("/", response_model=list[OrganisationOut])
def list_organisations(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    # Only organisations the user is a member of are ever returned —
    # this is the tenant-isolation boundary from blueprint section 7.
    rows = (
        db.query(Organisation, OrganisationMember.role)
        .join(OrganisationMember, OrganisationMember.organisation_id == Organisation.id)
        .filter(OrganisationMember.user_id == current_user.id)
        .all()
    )
    return [_to_out(org, role) for org, role in rows]


@router.patch("/{organisation_id}", response_model=OrganisationOut)
def update_organisation(
    organisation_id: uuid.UUID,
    payload: OrganisationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Organization settings — the home page's About Us text and its two
    quick-link buttons (Visit website / Access Open Data). Reserved for
    administrator+, the same bar as managing members.
    """
    membership = require_org_role(db, organisation_id, current_user.id, ADMINISTRATOR)
    org = db.query(Organisation).filter(Organisation.id == organisation_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    if payload.about_text is not None:
        org.about_text = payload.about_text or None
    if payload.website_url is not None:
        org.website_url = payload.website_url or None
    if payload.open_data_url is not None:
        org.open_data_url = payload.open_data_url or None
    if payload.custom_domain is not None:
        org.custom_domain = payload.custom_domain or None

    db.commit()
    db.refresh(org)
    return _to_out(org, membership.role)


@router.post("/{organisation_id}/branding/banner", response_model=OrganisationOut)
async def upload_banner(
    organisation_id: uuid.UUID,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The Home page's hero background image (see
    pages/OrganisationOverview.jsx — falls back to a generated gradient
    when this is unset). Reuses the same local-disk storage attachments
    use; note the same caveat applies (see core/storage.py) — this
    doesn't survive a redeploy on a platform with an ephemeral
    filesystem, so swap for object storage before relying on this in
    production.
    """
    membership = require_org_role(db, organisation_id, current_user.id, ADMINISTRATOR)
    org = db.query(Organisation).filter(Organisation.id == organisation_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image exceeds the 8 MB upload limit")

    relative_path, _ = save_upload(organisation_id, file.filename or "banner", content)
    org.banner_image_path = relative_path
    db.commit()
    db.refresh(org)
    return _to_out(org, membership.role)


@router.get("/{organisation_id}/branding/banner")
def get_banner(organisation_id: uuid.UUID, db: Session = Depends(get_db)):
    """Deliberately unauthenticated. A branding image is loaded by the
    browser via a plain `<img>` tag / CSS `background-image` — neither
    can attach a Bearer token, so gating this behind login would just
    make the banner silently fail to render everywhere it's used. The
    content itself (a decorative background image) isn't sensitive in
    the way the rest of an organisation's data is; this mirrors why the
    public project-share endpoints in routes/public.py need no auth
    either.
    """
    org = db.query(Organisation).filter(Organisation.id == organisation_id).first()
    if not org or not org.banner_image_path:
        raise HTTPException(status_code=404, detail="No banner image set")

    path = resolve_upload(org.banner_image_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Banner image is missing from storage")
    return FileResponse(path)


@router.get("/{organisation_id}/license", response_model=LicenseStatus)
def get_license_status(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_org_role(db, organisation_id, current_user.id, "viewer")
    org = db.query(Organisation).filter(Organisation.id == organisation_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    seats_used = (
        db.query(OrganisationMember).filter(OrganisationMember.organisation_id == organisation_id).count()
    )

    licensee_name = None
    deployment_mode = None
    if org.license_key:
        try:
            payload = licensing.verify_license(org.license_key)
            licensee_name = payload.get("licensee_name")
            deployment_mode = payload.get("deployment_mode")
        except licensing.LicenseError:
            pass  # Fall through with whatever denormalized fields we last stored.

    return LicenseStatus(
        has_license=bool(org.license_key),
        plan=org.plan,
        tier=org.license_tier,
        seat_limit=org.seat_limit if org.license_key else licensing.default_seat_limit(org.plan),
        seats_used=seats_used,
        expires_at=org.license_expires_at,
        licensee_name=licensee_name,
        deployment_mode=deployment_mode,
    )


@router.post("/{organisation_id}/license", response_model=LicenseStatus)
def apply_license(
    organisation_id: uuid.UUID,
    payload: LicenseApply,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply a license key issued by the vendor after a manually-invoiced
    payment (see backend/scripts/issue_license.py) — this is the entire
    "billing integration" for GeoCore today: no card capture, no
    subscription webhooks, just a signed key someone pastes in here.
    Verification is fully offline (see core/licensing.py), so this works
    identically for a cloud-hosted organisation and an air-gapped on-prem
    deployment.
    """
    require_org_role(db, organisation_id, current_user.id, ADMINISTRATOR)
    org = db.query(Organisation).filter(Organisation.id == organisation_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    try:
        claims = licensing.verify_license(payload.license_key)
    except licensing.LicenseError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # If this key was issued through the Admin Portal, honor a revocation
    # recorded there — this is the one enforcement point available for a
    # cloud-hosted organisation (there's no equivalent for an already-
    # applied on-prem instance with no path back to this database; see
    # models/customer.py's License docstring).
    record = db.query(LicenseRecord).filter(LicenseRecord.license_key == payload.license_key).first()
    if record and record.status == "revoked":
        raise HTTPException(status_code=422, detail="This license key has been revoked.")

    org.license_key = payload.license_key
    org.plan = claims["plan"]
    org.license_tier = claims.get("tier")
    org.seat_limit = claims.get("seat_limit")
    org.license_expires_at = (
        datetime.fromisoformat(claims["expires_at"]) if claims.get("expires_at") else None
    )
    if record and record.status != "revoked":
        record.status = "applied"
        record.applied_organisation_id = org.id
    log_action(
        db,
        action="license.applied",
        organisation_id=organisation_id,
        user_id=current_user.id,
        target_type="license",
        details={"plan": claims["plan"], "tier": claims.get("tier"), "seat_limit": claims.get("seat_limit")},
        ip_address=get_client_ip(request),
    )
    db.commit()

    seats_used = (
        db.query(OrganisationMember).filter(OrganisationMember.organisation_id == organisation_id).count()
    )
    return LicenseStatus(
        has_license=True,
        plan=org.plan,
        tier=org.license_tier,
        seat_limit=org.seat_limit,
        seats_used=seats_used,
        expires_at=org.license_expires_at,
        licensee_name=claims.get("licensee_name"),
        deployment_mode=claims.get("deployment_mode"),
    )


@router.get("/{organisation_id}/members", response_model=list[MemberOut])
def list_members(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Any member can see who else is on the team, but only administrator+
    # can change roles or add/remove people (enforced on those endpoints).
    require_org_role(db, organisation_id, current_user.id, "viewer")

    rows = (
        db.query(OrganisationMember, User)
        .join(User, User.id == OrganisationMember.user_id)
        .filter(OrganisationMember.organisation_id == organisation_id)
        .order_by(OrganisationMember.created_at)
        .all()
    )
    return [
        MemberOut(
            id=member.id,
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=member.role,
            created_at=member.created_at,
        )
        for member, user in rows
    ]


@router.post("/{organisation_id}/members", response_model=MemberOut, status_code=201)
def add_member(
    organisation_id: uuid.UUID,
    payload: MemberInvite,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_org_role(db, organisation_id, current_user.id, ADMINISTRATOR)

    org = db.query(Organisation).filter(Organisation.id == organisation_id).first()
    if org and org.plan == "personal":
        raise HTTPException(
            status_code=403,
            detail="This is a Personal-plan organisation — it can't have additional members. "
            "Upgrade to an Organization plan to invite people.",
        )

    if org:
        seat_limit = org.seat_limit if org.license_key else licensing.default_seat_limit(org.plan)
        if seat_limit is not None:
            current_seats = (
                db.query(OrganisationMember)
                .filter(OrganisationMember.organisation_id == organisation_id)
                .count()
            )
            if current_seats >= seat_limit:
                raise HTTPException(
                    status_code=403,
                    detail=f"This organisation's license allows {seat_limit} seat"
                    f"{'s' if seat_limit != 1 else ''}, and all of them are in use. "
                    "Apply a higher-seat license in Organization settings to add more people.",
                )

    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        # MVP limitation: no email-invite flow yet, so the person has to
        # register an account first. See docs/ARCHITECTURE.md.
        raise HTTPException(
            status_code=404,
            detail="No registered user with that email yet. Ask them to register first, "
            "then add them here.",
        )

    existing = get_membership(db, organisation_id, user.id)
    if existing:
        raise HTTPException(status_code=400, detail="This user is already a member")

    member = OrganisationMember(
        organisation_id=organisation_id, user_id=user.id, role=payload.role
    )
    db.add(member)
    log_action(
        db,
        action="member.added",
        organisation_id=organisation_id,
        user_id=current_user.id,
        target_type="member",
        target_id=user.id,
        details={"email": user.email, "role": payload.role},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(member)
    return MemberOut(
        id=member.id,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=member.role,
        created_at=member.created_at,
    )


@router.patch("/{organisation_id}/members/{member_id}", response_model=MemberOut)
def update_member_role(
    organisation_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: MemberRoleUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_org_role(db, organisation_id, current_user.id, ADMINISTRATOR)

    member = (
        db.query(OrganisationMember)
        .filter(
            OrganisationMember.id == member_id,
            OrganisationMember.organisation_id == organisation_id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.role == OWNER and payload.role != OWNER:
        _guard_last_owner(db, organisation_id, member.id)

    old_role = member.role
    member.role = payload.role
    log_action(
        db,
        action="member.role_changed",
        organisation_id=organisation_id,
        user_id=current_user.id,
        target_type="member",
        target_id=member.user_id,
        details={"old_role": old_role, "new_role": payload.role},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(member)
    user = db.query(User).filter(User.id == member.user_id).first()
    return MemberOut(
        id=member.id,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=member.role,
        created_at=member.created_at,
    )


@router.delete("/{organisation_id}/members/{member_id}", status_code=204)
def remove_member(
    organisation_id: uuid.UUID,
    member_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_org_role(db, organisation_id, current_user.id, ADMINISTRATOR)

    member = (
        db.query(OrganisationMember)
        .filter(
            OrganisationMember.id == member_id,
            OrganisationMember.organisation_id == organisation_id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.role == OWNER:
        _guard_last_owner(db, organisation_id, member.id)

    log_action(
        db,
        action="member.removed",
        organisation_id=organisation_id,
        user_id=current_user.id,
        target_type="member",
        target_id=member.user_id,
        details={"role": member.role},
        ip_address=get_client_ip(request),
    )
    db.delete(member)
    db.commit()
    return None


def _guard_last_owner(db: Session, organisation_id: uuid.UUID, member_id: uuid.UUID) -> None:
    """Prevent an organisation from being left with zero owners, which
    would otherwise be an unrecoverable state (nobody left with the
    'owner' rank to fix it) — see blueprint section 19 on data isolation
    and access integrity.
    """
    other_owners = (
        db.query(OrganisationMember)
        .filter(
            OrganisationMember.organisation_id == organisation_id,
            OrganisationMember.role == OWNER,
            OrganisationMember.id != member_id,
        )
        .count()
    )
    if other_owners == 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove or demote the last owner of an organisation",
        )


@router.get("/{organisation_id}/audit-log", response_model=list[AuditLogOut])
def list_audit_log(
    organisation_id: uuid.UUID,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Who did what, when — scoped to security/access-relevant actions
    (member changes, license operations, visibility changes, record
    deletion — see models/audit_log.py for exactly which). Administrator+
    only, the same bar as managing members. `limit` is capped at 500 so
    this can't be used to pull the entire history in one request.
    """
    require_org_role(db, organisation_id, current_user.id, ADMINISTRATOR)
    limit = min(max(limit, 1), 500)

    entries = (
        db.query(AuditLog)
        .filter(AuditLog.organisation_id == organisation_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )

    user_ids = {e.user_id for e in entries if e.user_id}
    emails = dict(db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()) if user_ids else {}

    out = []
    for e in entries:
        row = AuditLogOut.model_validate(e)
        row.user_email = emails.get(e.user_id)
        out.append(row)
    return out
