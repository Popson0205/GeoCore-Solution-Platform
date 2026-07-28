import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import require_org_role, require_survey_role
from backend.app.core.database import get_db
from backend.app.core.roles import ADMINISTRATOR, PROJECT_MANAGER, VIEWER
from backend.app.models.project import Project
from backend.app.models.survey import Survey
from backend.app.models.user import User
from backend.app.schemas.survey import SurveyCreate, SurveyOut, SurveyUpdate

router = APIRouter()


def _validate_project(
    db: Session, organisation_id: uuid.UUID, project_id: uuid.UUID | None
) -> None:
    """A survey's optional folder project must live in the same organisation
    as the survey — otherwise a caller could file a survey under a project
    they can see the id of but that belongs to another tenant.
    """
    if project_id is None:
        return
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or project.organisation_id != organisation_id:
        raise HTTPException(status_code=404, detail="Project not found in this organisation")


@router.post(
    "/organisations/{organisation_id}/surveys", response_model=SurveyOut, status_code=201
)
def create_survey(
    organisation_id: uuid.UUID,
    payload: SurveyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Same bar as creating a Project — Project Manager and above only
    # (blueprint section 13).
    require_org_role(db, organisation_id, current_user.id, PROJECT_MANAGER)
    _validate_project(db, organisation_id, payload.project_id)
    survey = Survey(
        organisation_id=organisation_id,
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        created_by=current_user.id,
    )
    db.add(survey)
    db.commit()
    db.refresh(survey)
    return survey


@router.get("/organisations/{organisation_id}/surveys", response_model=list[SurveyOut])
def list_surveys(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_org_role(db, organisation_id, current_user.id, VIEWER)
    return db.query(Survey).filter(Survey.organisation_id == organisation_id).all()


@router.get("/surveys/{survey_id}", response_model=SurveyOut)
def get_survey(
    survey_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Any organisation member may read; require_survey_role with VIEWER is the
    # membership + minimum-role check in one.
    survey, _ = require_survey_role(db, survey_id, current_user.id, VIEWER)
    return survey


@router.patch("/surveys/{survey_id}", response_model=SurveyOut)
def update_survey(
    survey_id: uuid.UUID,
    payload: SurveyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    survey, _ = require_survey_role(db, survey_id, current_user.id, PROJECT_MANAGER)
    if payload.title is not None:
        survey.title = payload.title
    if payload.description is not None:
        survey.description = payload.description
    if payload.status is not None:
        survey.status = payload.status
    if payload.project_id is not None:
        _validate_project(db, survey.organisation_id, payload.project_id)
        survey.project_id = payload.project_id
    db.commit()
    db.refresh(survey)
    return survey


@router.delete("/surveys/{survey_id}", response_model=SurveyOut)
def archive_survey(
    survey_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-archive a survey rather than hard-deleting it. Cascade-deleting a
    survey would take its collected Records with it; archiving protects that
    already-collected field data (Portal redesign Phase 1 decision). Reserved
    for administrator+, mirroring project deletion (blueprint section 13).
    """
    survey, _ = require_survey_role(db, survey_id, current_user.id, ADMINISTRATOR)
    survey.status = "archived"
    db.commit()
    db.refresh(survey)
    return survey

