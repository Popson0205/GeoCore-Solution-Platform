import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import get_organisation_for_member, get_project_for_member
from backend.app.core.database import get_db
from backend.app.models.attachment import Attachment
from backend.app.models.record import Record
from backend.app.models.survey import Survey
from backend.app.models.user import User
from backend.app.schemas.dashboard import OrganisationIndicators, ProjectIndicators, SurveyCount

router = APIRouter()


@router.get("/organisations/{organisation_id}/dashboard", response_model=OrganisationIndicators)
def organisation_indicators(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The Portal-wide indicators panel — every survey/record/attachment
    across the organisation, not walled inside one project. In the flat
    Survey123/KoBo model a Survey is itself the countable "layer" (the old
    separate AssetType layer is retired), so this counts surveys directly.
    """
    get_organisation_for_member(db, organisation_id, current_user.id)

    surveys = db.query(Survey).filter(Survey.organisation_id == organisation_id).all()

    counts_by_survey = dict(
        db.query(Record.survey_id, func.count(Record.id))
        .filter(Record.organisation_id == organisation_id)
        .group_by(Record.survey_id)
        .all()
    )

    record_count = sum(counts_by_survey.values())

    attachment_count = (
        db.query(func.count(Attachment.id))
        .join(Record, Record.id == Attachment.record_id)
        .filter(Record.organisation_id == organisation_id)
        .scalar()
        or 0
    )

    return OrganisationIndicators(
        organisation_id=organisation_id,
        survey_count=len(surveys),
        record_count=record_count,
        attachment_count=attachment_count,
        records_by_survey=[
            SurveyCount(
                survey_id=survey.id,
                name=survey.title,
                color=survey.color,
                record_count=counts_by_survey.get(survey.id, 0),
            )
            for survey in surveys
        ],
    )


@router.get("/projects/{project_id}/dashboard", response_model=ProjectIndicators)
def project_indicators(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kept working (not deprecated — Project remains a valid optional
    folder scope). Counts every Survey filed directly under this project
    (Survey.project_id) and its records/attachments — no asset-type
    indirection any more since a Survey owns its records' scope directly.
    """
    get_project_for_member(db, project_id, current_user.id)

    surveys = db.query(Survey).filter(Survey.project_id == project_id).all()
    survey_ids = [s.id for s in surveys]

    counts_by_survey = {}
    attachment_count = 0
    if survey_ids:
        counts_by_survey = dict(
            db.query(Record.survey_id, func.count(Record.id))
            .filter(Record.survey_id.in_(survey_ids))
            .group_by(Record.survey_id)
            .all()
        )
        attachment_count = (
            db.query(func.count(Attachment.id))
            .join(Record, Record.id == Attachment.record_id)
            .filter(Record.survey_id.in_(survey_ids))
            .scalar()
            or 0
        )

    record_count = sum(counts_by_survey.values())

    return ProjectIndicators(
        project_id=project_id,
        survey_count=len(surveys),
        record_count=record_count,
        attachment_count=attachment_count,
        records_by_survey=[
            SurveyCount(
                survey_id=survey.id,
                name=survey.title,
                color=survey.color,
                record_count=counts_by_survey.get(survey.id, 0),
            )
            for survey in surveys
        ],
    )
