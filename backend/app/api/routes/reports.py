import io
import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import get_organisation_for_member, get_project_for_member, require_active_license
from backend.app.core import geoai
from backend.app.core.dashboard_engine import compute_widget
from backend.app.core.database import get_db
from backend.app.models.attachment import Attachment
from backend.app.models.dashboard import Dashboard
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
# GeoAI context — everything a report actually renders (survey structure,
# dashboard widgets and their live computed values) gets handed to
# core/geoai.py so the narrative it writes can reference real field names,
# real chart values, and real survey titles instead of generic filler.
# ---------------------------------------------------------------------------


def _build_geoai_context(db: Session, organisation, surveys: list, summary: dict) -> dict:
    survey_ctx = [
        {
            "title": s.title,
            "description": s.description,
            "geometry_type": s.geometry_type,
            "record_count": next(
                (row["record_count"] for row in summary["by_survey"] if row["name"] == s.title), 0
            ),
            "fields": [{"label": f.label, "field_type": f.field_type} for f in s.field_definitions],
        }
        for s in surveys
    ]

    dashboards = (
        db.query(Dashboard)
        .options(selectinload(Dashboard.widgets))
        .filter(Dashboard.organisation_id == organisation.id)
        .all()
    )

    records_by_survey: dict = defaultdict(list)
    referenced_ids = {
        w.config.get("survey_id") for d in dashboards for w in d.widgets if w.config.get("survey_id")
    }
    if referenced_ids:
        for r in db.query(Record).filter(Record.survey_id.in_(referenced_ids)).all():
            records_by_survey[str(r.survey_id)].append(r)
    needs_org_records = any(
        w.widget_type == "map" and not w.config.get("survey_id") for d in dashboards for w in d.widgets
    )
    if needs_org_records:
        for r in db.query(Record).filter(Record.organisation_id == organisation.id).all():
            records_by_survey[str(r.survey_id)].append(r)

    dashboard_ctx = [
        {
            "name": d.name,
            "widgets": [
                {
                    "title": w.title,
                    "widget_type": w.widget_type,
                    "data": compute_widget(w, records_by_survey),
                }
                for w in d.widgets
            ],
        }
        for d in dashboards
    ]

    return {
        "organisation_name": organisation.name,
        "summary": summary,
        "surveys": survey_ctx,
        "dashboards": dashboard_ctx,
    }


# ---------------------------------------------------------------------------
# Organisation-scoped (Portal-wide) reports — Reports centralize to Portal
# scope alongside Dashboards, since a report that can't see cross-survey
# data would otherwise be the one artifact left behind by the rest of the
# redesign.
# ---------------------------------------------------------------------------


@router.post("/organisations/{organisation_id}/reports", response_model=ReportOut, status_code=201)
def generate_report_for_organisation(
    organisation_id: uuid.UUID,
    include_ai: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """`include_ai=true` asks GeoAI to write a narrative section — an
    actual explanation of what the data shows (referencing real survey
    fields and dashboard chart values), not just the counts in `summary`.
    Requires ANTHROPIC_API_KEY to be configured on this deployment; if
    it's not, this 503s with a clear message rather than silently
    returning a report without the narrative the caller explicitly asked
    for.
    """
    organisation = get_organisation_for_member(db, organisation_id, current_user.id)
    require_active_license(db, organisation_id)
    surveys = (
        db.query(Survey)
        .options(selectinload(Survey.field_definitions))
        .filter(Survey.organisation_id == organisation_id)
        .all()
    )
    summary = _build_summary_for_surveys(db, surveys)

    ai_summary = None
    if include_ai:
        try:
            context = _build_geoai_context(db, organisation, surveys, summary)
            ai_summary = geoai.generate_narrative(context)
        except geoai.GeoAIUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc))

    report = Report(
        organisation_id=organisation_id,
        project_id=None,
        title=f"{organisation.name} report — {datetime.now(timezone.utc):%Y-%m-%d}",
        summary=summary,
        ai_summary=ai_summary,
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


@router.get("/organisations/{organisation_id}/reports/geoai-status")
def geoai_status(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lets the frontend show/hide the "Generate with GeoAI insights"
    option instead of only discovering it's unavailable after a failed
    attempt.
    """
    get_organisation_for_member(db, organisation_id, current_user.id)
    from backend.app.core.config import settings

    return {"available": bool(settings.anthropic_api_key)}


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
    require_active_license(db, project.organisation_id)
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


def _wrap_text(pdf, text: str, x: float, y: float, max_width: float, font: str, size: int, leading: float):
    """Simple word-wrap for reportlab, which has no built-in paragraph
    flow on a bare Canvas. Returns the new y position after drawing.
    """
    from reportlab.pdfbase.pdfmetrics import stringWidth

    pdf.setFont(font, size)
    words = (text or "").split()
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if stringWidth(candidate, font, size) > max_width and line:
            pdf.drawString(x, y, line)
            y -= leading
            line = word
        else:
            line = candidate
    if line:
        pdf.drawString(x, y, line)
        y -= leading
    return y


def render_report_pdf(report: Report) -> io.BytesIO:
    """Render a Report row to a PDF buffer. Shared by the authenticated
    download endpoint below and the public share endpoint
    (routes/public.py) so both always produce the same document.

    Beyond the summary indicators, this also carries the GeoAI narrative
    (if one was generated) — the report is meant to stand on its own as
    an explanation of what was collected and what it shows, not just a
    count of records.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin = 20 * mm
    max_width = width - 2 * margin

    def new_page_if_needed(y, threshold=30 * mm):
        if y < threshold:
            pdf.showPage()
            return height - margin
        return y

    y = height - margin
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(margin, y, "GeoCore Report")
    y -= 10 * mm
    pdf.setFont("Helvetica", 12)
    pdf.drawString(margin, y, report.title)
    y -= 12 * mm

    if report.ai_summary:
        pdf.setFont("Helvetica-Bold", 13)
        pdf.drawString(margin, y, "GeoAI narrative")
        y -= 8 * mm
        for paragraph in report.ai_summary.split("\n"):
            if not paragraph.strip():
                y -= 3 * mm
                continue
            y = _wrap_text(pdf, paragraph, margin, y, max_width, "Helvetica", 10, 5 * mm)
            y = new_page_if_needed(y)
        y -= 6 * mm
        y = new_page_if_needed(y)

    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(margin, y, "Summary indicators")
    y -= 8 * mm
    pdf.setFont("Helvetica", 11)
    summary = report.summary or {}
    for line in [
        f"Surveys: {summary.get('survey_count', 0)}",
        f"Records: {summary.get('record_count', 0)}",
        f"Attachments: {summary.get('attachment_count', 0)}",
    ]:
        pdf.drawString(margin + 2 * mm, y, line)
        y -= 7 * mm
    y -= 3 * mm
    y = new_page_if_needed(y)

    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(margin, y, "Records by survey")
    y -= 8 * mm
    pdf.setFont("Helvetica", 11)
    for row in summary.get("by_survey", []):
        pdf.drawString(margin + 2 * mm, y, f"{row['name']}: {row['record_count']}")
        y -= 7 * mm
        y = new_page_if_needed(y)

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
