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
from backend.app.models.asset_type import AssetType
from backend.app.models.attachment import Attachment
from backend.app.models.record import Record
from backend.app.models.report import Report
from backend.app.models.survey import Survey
from backend.app.models.user import User
from backend.app.schemas.report import ReportOut

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_summary_for_asset_types(db: Session, asset_types: list[AssetType]) -> dict:
    asset_type_ids = [a.id for a in asset_types]
    counts_by_type = {}
    attachment_count = 0
    if asset_type_ids:
        counts_by_type = dict(
            db.query(Record.asset_type_id, func.count(Record.id))
            .filter(Record.asset_type_id.in_(asset_type_ids))
            .group_by(Record.asset_type_id)
            .all()
        )
        attachment_count = (
            db.query(func.count(Attachment.id))
            .join(Record, Record.id == Attachment.record_id)
            .filter(Record.asset_type_id.in_(asset_type_ids))
            .scalar()
            or 0
        )
    return {
        "asset_type_count": len(asset_types),
        "record_count": sum(counts_by_type.values()),
        "attachment_count": attachment_count,
        "by_asset_type": [
            {"name": a.name, "record_count": counts_by_type.get(a.id, 0)} for a in asset_types
        ],
    }


def _build_organisation_summary(db: Session, organisation_id: uuid.UUID) -> dict:
    asset_types = (
        db.query(AssetType)
        .join(Survey, Survey.id == AssetType.survey_id)
        .filter(Survey.organisation_id == organisation_id)
        .all()
    )
    return _build_summary_for_asset_types(db, asset_types)


def _build_project_summary(db: Session, project_id: uuid.UUID) -> dict:
    asset_types = (
        db.query(AssetType)
        .join(Survey, Survey.id == AssetType.survey_id)
        .filter(Survey.project_id == project_id)
        .all()
    )
    return _build_summary_for_asset_types(db, asset_types)


# ---------------------------------------------------------------------------
# Organisation-scoped (Portal-wide) reports (Portal redesign Phase 2, this
# Phase 6) — Reports centralize to Portal scope alongside Dashboards, per
# the 10-phase plan's Phase 6 "Open question" recommendation, since a
# report that can't see cross-survey data would otherwise be the one
# artifact left behind by the rest of the redesign.
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
        f"Asset types: {summary.get('asset_type_count', 0)}",
        f"Records: {summary.get('record_count', 0)}",
        f"Attachments: {summary.get('attachment_count', 0)}",
    ]
    for line in lines:
        pdf.drawString(22 * mm, y, line)
        y -= 7 * mm

    y -= 5 * mm
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(20 * mm, y, "Records by asset type")
    y -= 8 * mm
    pdf.setFont("Helvetica", 11)
    for row in summary.get("by_asset_type", []):
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
