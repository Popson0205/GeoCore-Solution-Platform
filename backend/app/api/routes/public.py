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
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from backend.app.api.deps_project import require_active_license
from backend.app.core import email as email_module
from backend.app.core.dashboard_engine import apply_time_filter, compute_widget
from backend.app.core.data_import import backfill_location_fields
from backend.app.core.database import get_db
from backend.app.core.form_engine import FormValidationError, process_submission
from backend.app.models.customer import Customer
from backend.app.models.dashboard import Dashboard
from backend.app.models.feature_layer import FeatureLayer
from backend.app.models.project import Project
from backend.app.models.record import Record
from backend.app.models.report import Report
from backend.app.models.survey import FormSection, Survey, SubmissionAssignee
from backend.app.schemas.public_purchase import PurchaseRequestCreate, PurchaseRequestReceipt
from backend.app.schemas.feature_layer import FeatureLayerOut
from backend.app.schemas.dashboards import DashboardOut
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


# ---------------------------------------------------------------------------
# Feature layer sharing — a separate, read-only public link from the
# Project-wide share above. Toggled from Organization Settings/the
# feature layer's own settings (see routes/feature_layers.py's
# enable_share); this is the actual consumption side, keyed by the
# layer's own share_token rather than a project's.
# ---------------------------------------------------------------------------


def _get_shared_feature_layer(db: Session, token: str) -> FeatureLayer:
    layer = (
        db.query(FeatureLayer)
        .filter(FeatureLayer.share_token == token, FeatureLayer.share_enabled.is_(True))
        .first()
    )
    if not layer:
        raise HTTPException(status_code=404, detail="This share link is invalid or disabled")
    return layer


@router.get("/layers/{token}", response_model=FeatureLayerOut)
def public_feature_layer(token: str, db: Session = Depends(get_db)):
    layer = _get_shared_feature_layer(db, token)
    out = FeatureLayerOut.model_validate(layer)
    out.record_count = db.query(func.count(Record.id)).filter(Record.feature_layer_id == layer.id).scalar() or 0
    out.survey_title = layer.survey.title if layer.survey else None
    return out


@router.get("/layers/{token}/records", response_model=list[RecordOut])
def public_feature_layer_records(token: str, db: Session = Depends(get_db)):
    layer = _get_shared_feature_layer(db, token)
    return (
        db.query(Record)
        .filter(Record.feature_layer_id == layer.id)
        .order_by(Record.created_at.desc())
        .all()
    )


def _get_shared_dashboard(db: Session, token: str) -> Dashboard:
    dashboard = (
        db.query(Dashboard)
        .filter(
            Dashboard.share_token == token,
            Dashboard.visibility == "public",
            Dashboard.deleted_at.is_(None),
        )
        .first()
    )
    if not dashboard:
        raise HTTPException(status_code=404, detail="This share link is invalid or disabled")
    return dashboard


@router.get("/dashboards/{token}", response_model=DashboardOut)
def public_dashboard(token: str, db: Session = Depends(get_db)):
    return _get_shared_dashboard(db, token)


@router.get("/dashboards/{token}/data")
def public_dashboard_data(token: str, db: Session = Depends(get_db)):
    """Same computation as the authenticated GET /dashboards/{id}/data
    (routes/dashboards.py) — every widget's current data in one call —
    just reached via the share token instead of a bearer token.
    """
    dashboard = _get_shared_dashboard(db, token)

    referenced_ids = {
        w.config.get("feature_layer_id") for w in dashboard.widgets if w.config.get("feature_layer_id")
    }
    needs_org_records = any(
        w.widget_type == "map" and not w.config.get("feature_layer_id") for w in dashboard.widgets
    )

    records_by_layer: dict = defaultdict(list)
    if referenced_ids:
        for r in db.query(Record).filter(Record.feature_layer_id.in_(referenced_ids)).all():
            records_by_layer[str(r.feature_layer_id)].append(r)
    if needs_org_records:
        for r in db.query(Record).filter(Record.organisation_id == dashboard.organisation_id).all():
            records_by_layer[str(r.feature_layer_id)].append(r)

    if dashboard.time_filter:
        records_by_layer = {
            layer_id: apply_time_filter(recs, dashboard.time_filter)
            for layer_id, recs in records_by_layer.items()
        }

    return {str(w.id): compute_widget(w, records_by_layer) for w in dashboard.widgets}


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
    require_active_license(db, survey.organisation_id)

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

    # Fill in latitude/longitude from the submitted geometry BEFORE
    # validation runs — see routes/records.py's create_record_for_survey
    # for why this has to happen before, not after.
    field_data = dict(payload.field_data)
    backfill_location_fields(
        field_data, geometry.model_dump(), {f.field_key for f in survey.field_definitions}
    )

    # Exact same authoritative engine as an internal record submission
    # (routes/records.py) — a public/assigned submitter gets no special
    # treatment or reduced validation.
    try:
        processed_field_data = process_submission(survey, field_data)
    except FormValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors)

    if not survey.feature_layer:
        raise HTTPException(
            status_code=500,
            detail="This survey has no feature layer to write records into. Contact support.",
        )

    record = Record(
        organisation_id=survey.organisation_id,
        survey_id=survey.id,
        feature_layer_id=survey.feature_layer.id,
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


# ---------------------------------------------------------------------------
# Purchase requests — the public, unauthenticated "Purchase a license"
# form on the marketing site. This is the front door of onboarding: no
# self-serve organisation creation any more (see routes/organisations.py's
# create_organisation and the Admin Portal's issue_license) — a real
# Organisation only comes into existence once someone has an actual
# license key to activate (see the /activate-license flow in
# routes/organisations.py). This endpoint just gets the request in front
# of your team; nothing here issues a license or creates an organisation.
# ---------------------------------------------------------------------------


def _next_customer_number(db: Session) -> str:
    count = db.query(Customer).count()
    return f"GC-{count + 1:06d}"


@router.post("/purchase-requests", response_model=PurchaseRequestReceipt, status_code=201)
def submit_purchase_request(payload: PurchaseRequestCreate, db: Session = Depends(get_db)):
    # Match by email — someone re-submitting (e.g. to change their plan
    # before payment) updates the same lead rather than creating a
    # duplicate customer number every time.
    customer = db.query(Customer).filter(Customer.email == payload.email.lower()).first()
    if not customer:
        customer = Customer(
            customer_number=_next_customer_number(db),
            name=payload.name,
            email=payload.email.lower(),
        )
        db.add(customer)

    customer.name = payload.name
    customer.phone = payload.phone
    customer.requested_plan = payload.plan
    customer.requested_tier = payload.tier
    customer.requested_seats = payload.seats
    customer.requested_organisation_name = payload.organisation_name
    customer.desired_domain = payload.desired_domain
    if payload.message:
        customer.notes = payload.message
    db.commit()
    db.refresh(customer)

    email_module.send_purchase_request_notification(
        customer_number=customer.customer_number,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        organisation_name=payload.organisation_name,
        plan=payload.plan,
        tier=payload.tier,
        seats=payload.seats,
        desired_domain=payload.desired_domain,
        message=payload.message,
    )

    return PurchaseRequestReceipt(customer_number=customer.customer_number)
