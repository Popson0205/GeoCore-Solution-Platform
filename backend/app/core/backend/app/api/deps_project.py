import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.app.core.roles import has_min_role
from backend.app.models.organisation import OrganisationMember
from backend.app.models.project import Project


def get_membership(
    db: Session, organisation_id: uuid.UUID, user_id: uuid.UUID
) -> OrganisationMember | None:
    return (
        db.query(OrganisationMember)
        .filter(
            OrganisationMember.organisation_id == organisation_id,
            OrganisationMember.user_id == user_id,
        )
        .first()
    )


def require_org_role(
    db: Session, organisation_id: uuid.UUID, user_id: uuid.UUID, minimum: str
) -> OrganisationMember:
    """Fetch the caller's organisation membership and enforce a minimum role
    (blueprint section 13). Raises 403 if the caller isn't a member, or is a
    member but below `minimum`.
    """
    membership = get_membership(db, organisation_id, user_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organisation")
    if not has_min_role(membership.role, minimum):
        raise HTTPException(
            status_code=403,
            detail=f"This action requires the '{minimum}' role or higher",
        )
    return membership


def get_project_for_member(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> Project:
    """Fetch a project and enforce that the current user belongs to the
    organisation it lives in. Every project-scoped module (asset types,
    records, attachments, dashboard, reports) should route through this so
    the organisation boundary from blueprint section 7 is checked
    consistently in one place.

    This only checks membership, not role — use `get_project_and_role` or
    `require_project_role` where a specific role is required (e.g. writes).
    """
    project, _ = get_project_and_role(db, project_id, user_id)
    return project


def get_project_and_role(
    db: Session, project_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[Project, OrganisationMember]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    membership = get_membership(db, project.organisation_id, user_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organisation")

    return project, membership


def require_project_role(
    db: Session, project_id: uuid.UUID, user_id: uuid.UUID, minimum: str
) -> tuple[Project, OrganisationMember]:
    """Fetch a project and enforce that the caller's role in its
    organisation is at least `minimum`. Use this for any write operation
    (create/update/delete) that shouldn't be open to every member — e.g. a
    Viewer or Analyst should never be able to edit records, and only
    Project Manager and above should manage asset types.
    """
    project, membership = get_project_and_role(db, project_id, user_id)
    if not has_min_role(membership.role, minimum):
        raise HTTPException(
            status_code=403,
            detail=f"This action requires the '{minimum}' role or higher",
        )
    return project, membership
