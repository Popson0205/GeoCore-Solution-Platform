import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.app.core.roles import DATA_COLLECTOR, has_min_role
from backend.app.models.organisation import Organisation, OrganisationMember
from backend.app.models.project import Project
from backend.app.models.survey import Survey
from backend.app.models.survey_assignment import SurveyAssignment


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


def get_organisation_for_member(
    db: Session, organisation_id: uuid.UUID, user_id: uuid.UUID
) -> Organisation:
    """Fetch an organisation and enforce that the current user is a member
    of it (no role floor). The organisation-scoped analogue of
    `get_project_for_member` — every Portal-scoped route (records,
    attachments, dashboards, reports — Portal redesign Phase 2, this Phase
    6) should route through this so the organisation boundary is checked
    consistently in one place, the way project-scoped routes already do
    via `get_project_for_member`.

    Use `require_org_role` alongside this (or instead of it) where a
    specific role is required, e.g. for writes.
    """
    organisation = db.query(Organisation).filter(Organisation.id == organisation_id).first()
    if not organisation:
        raise HTTPException(status_code=404, detail="Organisation not found")
    if not get_membership(db, organisation_id, user_id):
        raise HTTPException(status_code=403, detail="Not a member of this organisation")
    return organisation


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


def get_survey_and_role(
    db: Session, survey_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[Survey, OrganisationMember]:
    """Fetch a survey and enforce that the caller belongs to the organisation
    it lives in. A Survey's tenancy anchor is its own `organisation_id`, not
    its (optional) project — so access resolves directly through that, which
    is what lets records be queried Portal-wide instead of walled inside one
    Project (Portal redesign Phase 1).
    """
    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    membership = get_membership(db, survey.organisation_id, user_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organisation")

    return survey, membership


def get_survey_for_member(db: Session, survey_id: uuid.UUID, user_id: uuid.UUID) -> Survey:
    """Fetch a survey and enforce organisation membership (no role floor).
    The survey-scoped analogue of `get_project_for_member` — every
    survey-scoped read should route through this so the organisation
    boundary is checked in one place.
    """
    survey, _ = get_survey_and_role(db, survey_id, user_id)
    return survey


def _enforce_survey_assignment_scope(db: Session, survey: Survey, user_id: uuid.UUID) -> None:
    """Data Collectors only (Portal redesign Phase 9): if this user has at
    least one `SurveyAssignment` row anywhere in the survey's organisation,
    their access narrows to exactly the surveys listed there. A user with
    zero assignment rows in the org is unrestricted — their org role
    applies unchanged, which is what keeps this purely opt-in.
    """
    has_any_assignment = (
        db.query(SurveyAssignment.id)
        .join(Survey, Survey.id == SurveyAssignment.survey_id)
        .filter(
            SurveyAssignment.user_id == user_id,
            Survey.organisation_id == survey.organisation_id,
        )
        .first()
        is not None
    )
    if not has_any_assignment:
        return

    is_assigned_to_this_survey = (
        db.query(SurveyAssignment.id)
        .filter(SurveyAssignment.survey_id == survey.id, SurveyAssignment.user_id == user_id)
        .first()
        is not None
    )
    if not is_assigned_to_this_survey:
        raise HTTPException(
            status_code=403, detail="You're not assigned to this survey"
        )


def require_survey_role(
    db: Session, survey_id: uuid.UUID, user_id: uuid.UUID, minimum: str
) -> tuple[Survey, OrganisationMember]:
    """Fetch a survey and enforce that the caller's role in its organisation
    is at least `minimum`. The survey-scoped analogue of
    `require_project_role` — use for any survey write (create/update/delete).

    Also enforces per-survey Data Collector scoping (Portal redesign
    Phase 9) — see `_enforce_survey_assignment_scope`.
    """
    survey, membership = get_survey_and_role(db, survey_id, user_id)
    if not has_min_role(membership.role, minimum):
        raise HTTPException(
            status_code=403,
            detail=f"This action requires the '{minimum}' role or higher",
        )
    if membership.role == DATA_COLLECTOR:
        _enforce_survey_assignment_scope(db, survey, user_id)
    return survey, membership
