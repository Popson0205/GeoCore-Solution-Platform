import io
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import get_organisation_for_member, get_project_for_member
from backend.app.core.database import get_db
from backend.app.models.attachment import Attachment
from backend.app.models.record import Record
from backend.app.models.report import Report
from backend.app.models.survey import Survey
from backend.app.models.user import User
from backend.app.schemas.report import ReportOut

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_summary_for_surveys(db: Session, surveys: list[Survey]) -> dict:
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
    return {
        "survey_count": len(surveys),
        "record_count": sum(counts_by_survey.values()),
        "attachment_count": attachment_count,
        "by_survey": [
            {"name": s.title, "record_count": counts_by_survey.get(s.id, 0)} for s in surveys
        ],
    }


def _build_organisation_summary(db: Session, organisation_id: uuid.UUID) -> dict:
    surveys = db.query(Survey).filter(Survey.organisation_id == organisation_id).all()
    return _build_summary_for_surveys(db, surveys)


def _build_project_summary(db: Session, project_id: uuid.UUID) -> dict:
    surveys = db.query(Survey).filter(Survey.project_id == project_id).all()
    return _build_summary_for_surveys(db, surveys)


# ---------------------------------------------------------------------------
# Organisation-scoped (Portal-wide) reports — Reports centralize to Portal
# scope alongside Dashboards, since a report that can't see cross-survey
# data would otherwise be the one artifact left behind by the rest of the
# redesign.
# ---------------------------------------------------------------------------


@router.post("/organisations/{organisation_id}/reports", response_model=ReportOut, status_code=201)
def generate_report_for_organisation(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    organisation = get_organisation_for_member(db, organisation_id, current_user.id)
    summary = _build_organisation_summary(db, organisation_id)

    report = Report(
        organisation_id=organisation_id,
        project_id=None,
        title=f"{organisation.name} report — {datetime.now(timezone.utc):%Y-%m-%d}",
        summary=summary,
        generated_by=current_user.id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/organisations/{organisation_id}/reports", response_model=list[ReportOut])
def list_reports_for_organisation(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_organisation_for_member(db, organisation_id, current_user.id)
    return (
        db.query(Report)
        .filter(Report.organisation_id == organisation_id)
        .order_by(Report.created_at.desc())
        .all()
    )


# ---------------------------------------------------------------------------
# Deprecated project-scoped routes — kept so clients still built against the
# old shape keep working. New integrations should use the organisation-
# scoped routes above.
# ---------------------------------------------------------------------------


@router.post(
    "/projects/{project_id}/reports", response_model=ReportOut, status_code=201, deprecated=True
)
def generate_report(
    project_id: uuid.UUID,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deprecated — use `POST /organisations/{organisation_id}/reports`
    for a Portal-wide report. Kept for old clients wanting a report scoped
    to just this project's surveys.
    """
    project = get_project_for_member(db, project_id, current_user.id)
    response.headers["Deprecation"] = "true"
    logger.warning(
        "Deprecated route called: POST /projects/%s/reports "
        "(use POST /organisations/{organisation_id}/reports instead)",
        project_id,
    )
    summary = _build_project_summary(db, project_id)

    report = Report(
        organisation_id=project.organisation_id,
        project_id=project_id,
        title=f"{project.name} report — {datetime.now(timezone.utc):%Y-%m-%d}",
        summary=summary,
        generated_by=current_user.id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get(
    "/projects/{project_id}/reports", response_model=list[ReportOut], deprecated=True
)
def list_reports(
    project_id: uuid.UUID,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deprecated — use `GET /organisations/{organisation_id}/reports`
    and filter client-side by `project_id` if you still want the folder
    view.
    """
    get_project_for_member(db, project_id, current_user.id)
    response.headers["Deprecation"] = "true"
    logger.warning(
        "Deprecated route called: GET /projects/%s/reports "
        "(use GET /organisations/{organisation_id}/reports instead)",
        project_id,
    )
    return (
        db.query(Report)
        .filter(Report.project_id == project_id)
        .order_by(Report.created_at.desc())
        .all()
    )


def _get_report_for_member(db: Session, report_id: uuid.UUID, user: User) -> Report:
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    get_organisation_for_member(db, report.organisation_id, user.id)
    return report


def render_report_pdf(report: Report) -> io.BytesIO:
    """Render a Report row to a PDF buffer. Shared by the authenticated
    download endpoint below and the public share endpoint
    (routes/public.py) so both always produce the same document.
    """
    # Imported lazily so the reportlab dependency only needs to load when a
    # PDF is actually requested.
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    y = height - 25 * mm
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(20 * mm, y, "GeoCore Report")
    y -= 10 * mm
    pdf.setFont("Helvetica", 12)
    pdf.drawString(20 * mm, y, report.title)
    y -= 12 * mm

    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(20 * mm, y, "Summary indicators")
    y -= 8 * mm
    pdf.setFont("Helvetica", 11)
    summary = report.summary or {}
    lines = [
        f"Surveys: {summary.get('survey_count', 0)}",
        f"Records: {summary.get('record_count', 0)}",
        f"Attachments: {summary.get('attachment_count', 0)}",
    ]
    for line in lines:
        pdf.drawString(22 * mm, y, line)
        y -= 7 * mm

    y -= 5 * mm
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(20 * mm, y, "Records by survey")
    y -= 8 * mm
    pdf.setFont("Helvetica", 11)
    for row in summary.get("by_survey", []):
        pdf.drawString(22 * mm, y, f"{row['name']}: {row['record_count']}")
        y -= 7 * mm
        if y < 25 * mm:
            pdf.showPage()
            y = height - 25 * mm

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer


@router.get("/reports/{report_id}/pdf")
def download_report_pdf(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = _get_report_for_member(db, report_id, current_user)
    buffer = render_report_pdf(report)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="report-{report.id}.pdf"'},
    )
