import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.core.database import get_db
from backend.app.models.organisation import OrganisationMember
from backend.app.models.project import Project
from backend.app.models.user import User
from backend.app.schemas.project import ProjectCreate, ProjectOut

router = APIRouter()


def _require_membership(db: Session, organisation_id: uuid.UUID, user_id: uuid.UUID) -> None:
    membership = (
        db.query(OrganisationMember)
        .filter(
            OrganisationMember.organisation_id == organisation_id,
            OrganisationMember.user_id == user_id,
        )
        .first()
    )
    if not membership:
        # Every organisation-scoped request must be checked against the
        # authenticated user's membership — blueprint section 7.
        raise HTTPException(status_code=403, detail="Not a member of this organisation")


@router.post(
    "/organisations/{organisation_id}/projects", response_model=ProjectOut, status_code=201
)
def create_project(
    organisation_id: uuid.UUID,
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_membership(db, organisation_id, current_user.id)
    project = Project(
        organisation_id=organisation_id, name=payload.name, description=payload.description
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get(
    "/organisations/{organisation_id}/projects", response_model=list[ProjectOut]
)
def list_projects(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_membership(db, organisation_id, current_user.id)
    return db.query(Project).filter(Project.organisation_id == organisation_id).all()
