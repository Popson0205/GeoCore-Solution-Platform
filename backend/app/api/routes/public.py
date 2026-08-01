"""Unauthenticated, read-only endpoints for a project's shareable link
(blueprint section 7's "explicit, secure sharing mechanism" and section 18,
which frames reports as being for communicating results outward).

None of these depend on get_current_user. Access is instead gated purely by
knowing the project's `share_token`, and only while `share_enabled` is True
— both are controlled by a Project Manager+ via routes/projects.py. Every
lookup here filters by (share_token AND share_enabled) together and returns
a generic 404 either way, so a disabled or wrong token can't be used to
probe for a project's existence.

Surveys/records are resolved through each project's Surveys directly
(Survey carries its own organisation_id/project_id — no asset-type
indirection any more) — see routes/surveys.py and routes/records.py for
the same pattern on the authenticated side.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload

from backend.app.core.database import get_db
from backend.app.core.form_engine import FormValidationError, process_submission
from backend.app.models.project import Project
from backend.app.models.record import Record
from backend.app.models.report import Report
from backend.app.models.survey import FormSection, Survey, SubmissionAssignee
from backend.app.schemas.project import ProjectOut
from backend.app.schemas.record import Geometry, RecordOut
from backend.app.schemas.report import ReportOut
from backend.app.schemas.survey import PublicSubmitReceipt, PublicSubmitRequest, PublicSubmitSchema, SurveyOut

router = APIRouter()

_SURVEY_FORM_LOAD = (
    selectinload(Survey.sections).selectinload(FormSection.fields),
    selectinload(Survey.field_definitions),
)


def _get_shared_project(db: Session, token: str) -> Project:
    project = (
        db.query(Project)
        .filter(Project.share_token == token, Project.share_enabled.is_(True))
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="This share link is invalid or disabled")
    return project


def _survey_ids_for_project(db: Session, project_id: uuid.UUID) -> list[uuid.UUID]:
    return [row[0] for row in db.query(Survey.id).filter(Survey.project_id == project_id).all()]


@router.get("/{token}/project", response_model=ProjectOut)
def public_project(token: str, db: Session = Depends(get_db)):
    return _get_shared_project(db, token)


@router.get("/{token}/surveys", response_model=list[SurveyOut])
def public_surveys(token: str, db: Session = Depends(get_db)):
    project = _get_shared_project(db, token)
    survey_ids = _survey_ids_for_project(db, project.id)
    if not survey_ids:
        return []
    return (
        db.query(Survey)
        .options(*_SURVEY_FORM_LOAD)
        .filter(Survey.id.in_(survey_ids))
        .all()
    )


@router.get("/{token}/records", response_model=list[RecordOut])
def public_records(token: str, db: Session = Depends(get_db)):
    project = _get_shared_project(db, token)
    survey_ids = _survey_ids_for_project(db, project.id)
    if not survey_ids:
        return []
    return (
        db.query(Record)
        .filter(Record.survey_id.in_(survey_ids))
        .order_by(Record.created_at.desc())
        .all()
    )


@router.get("/{token}/reports", response_model=list[ReportOut])
def public_reports(token: str, db: Session = Depends(get_db)):
    project = _get_shared_project(db, token)
    return (
        db.query(Report)
        .filter(Report.project_id == project.id)
        .order_by(Report.created_at.desc())
        .all()
    )


@router.get("/{token}/reports/{report_id}/pdf")
def public_report_pdf(token: str, report_id: uuid.UUID, db: Session = Depends(get_db)):
    project = _get_shared_project(db, token)
    report = (
        db.query(Report)
        .filter(Report.id == report_id, Report.project_id == project.id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    from backend.app.api.routes.reports import render_report_pdf

    buffer = render_report_pdf(report)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="report-{report.id}.pdf"'},
    )


# ---------------------------------------------------------------------------
# Submission links — a Survey's public/assigned data collection form. The
# link itself (token/enabled/access) and its assignees live directly on
# the Survey, since the Survey *is* the form a public submitter fills out
# (flat Survey123/KoBo model — no asset type to pick between any more).
# Distinct from the project-level read-only share link above: this is
# write-only (a person can submit a record, nothing else). See
# models/survey.py's submission_* columns and routes/surveys.py's
# `_submission_status`, which manages the same link from the authenticated
# side.
# ---------------------------------------------------------------------------


def _get_survey_for_submission(db: Session, token: str) -> Survey:
    survey = (
        db.query(Survey)
        .options(*_SURVEY_FORM_LOAD)
        .filter(Survey.submission_token == token, Survey.submission_enabled.is_(True))
        .first()
    )
    if not survey:
        raise HTTPException(status_code=404, detail="This submission link is invalid or disabled")
    return survey


@router.get("/submit/{token}", response_model=PublicSubmitSchema)
def public_submit_schema(token: str, db: Session = Depends(get_db)):
    survey = _get_survey_for_submission(db, token)
    return PublicSubmitSchema(
        project_name=survey.title,
        access=survey.submission_access,
        survey=survey,
    )


@router.post("/submit/{token}", response_model=PublicSubmitReceipt, status_code=201)
def public_submit_record(token: str, payload: PublicSubmitRequest, db: Session = Depends(get_db)):
    survey = _get_survey_for_submission(db, token)

    if survey.submission_access == "assigned":
        email = (payload.submitter_email or "").strip().lower()
        if not email:
            raise HTTPException(status_code=422, detail=["An email is required to submit this form"])
        assigned = (
            db.query(SubmissionAssignee)
            .filter(
                SubmissionAssignee.survey_id == survey.id,
                SubmissionAssignee.email == email,
            )
            .first()
        )
        if not assigned:
            raise HTTPException(
                status_code=403, detail="This email isn't on the assigned list for this form"
            )

    try:
        geometry = Geometry(**payload.geometry)
    except Exception as exc:  # pydantic validation error on the nested dict
        raise HTTPException(status_code=422, detail=[f"Invalid location: {exc}"])

    # Exact same authoritative engine as an internal record submission
    # (routes/records.py) — a public/assigned submitter gets no special
    # treatment or reduced validation.
    try:
        processed_field_data = process_submission(survey, payload.field_data)
    except FormValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors)

    record = Record(
        organisation_id=survey.organisation_id,
        survey_id=survey.id,
        project_id=survey.project_id,
        geometry=geometry.model_dump(),
        field_data=processed_field_data,
        created_by=None,
        submitted_by_name=(payload.submitter_name or "").strip() or None,
        submitted_by_email=(payload.submitter_email or "").strip().lower() or None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return PublicSubmitReceipt(id=record.id, submitted_at=record.created_at)
