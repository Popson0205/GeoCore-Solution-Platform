import re
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.core.database import get_db
from backend.app.models.organisation import Organisation, OrganisationMember
from backend.app.models.user import User
from backend.app.schemas.organisation import OrganisationCreate, OrganisationOut

router = APIRouter()


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or uuid.uuid4().hex[:8]


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
    db.add(OrganisationMember(organisation_id=org.id, user_id=current_user.id, role="owner"))
    db.commit()
    db.refresh(org)
    return org


@router.get("/", response_model=list[OrganisationOut])
def list_organisations(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    # Only organisations the user is a member of are ever returned —
    # this is the tenant-isolation boundary from blueprint section 7.
    return (
        db.query(Organisation)
        .join(OrganisationMember, OrganisationMember.organisation_id == Organisation.id)
        .filter(OrganisationMember.user_id == current_user.id)
        .all()
    )
