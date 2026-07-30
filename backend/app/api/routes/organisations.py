import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import get_membership, require_org_role
from backend.app.core.database import get_db
from backend.app.core.roles import ADMINISTRATOR, OWNER
from backend.app.models.organisation import Organisation, OrganisationMember
from backend.app.models.user import User
from backend.app.schemas.organisation import (
    MemberInvite,
    MemberOut,
    MemberRoleUpdate,
    OrganisationCreate,
    OrganisationOut,
)

router = APIRouter()


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or uuid.uuid4().hex[:8]


def _to_out(org: Organisation, my_role: str | None) -> OrganisationOut:
    out = OrganisationOut.model_validate(org)
    out.my_role = my_role
    return out


@router.post("/", response_model=OrganisationOut, status_code=201)
def create_organisation(
    payload: OrganisationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Guarantee a unique, URL-friendly slug even if names collide.
    base_slug = _slugify(payload.name)
    slug = base_slug
    counter = 1
    while db.query(Organisation).filter(Organisation.slug == slug).first():
        counter += 1
        slug = f"{base_slug}-{counter}"

    org = Organisation(name=payload.name, slug=slug)
    db.add(org)
    db.flush()

    # Creator becomes the organisation owner (see blueprint section 13: User Roles).
    db.add(OrganisationMember(organisation_id=org.id, user_id=current_user.id, role=OWNER))
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_org_role(db, organisation_id, current_user.id, ADMINISTRATOR)

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

    member.role = payload.role
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
