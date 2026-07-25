import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.app.models.organisation import OrganisationMember
from backend.app.models.project import Project


def get_project_for_member(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> Project:
    """Fetch a project and enforce that the current user belongs to the
    organisation it lives in. Every project-scoped module (asset types,
    records, attachments, dashboard, reports) should route through this so
    the organisation boundary from blueprint section 7 is checked
    consistently in one place.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    membership = (
        db.query(OrganisationMember)
        .filter(
            OrganisationMember.organisation_id == project.organisation_id,
            OrganisationMember.user_id == user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organisation")

    return project
