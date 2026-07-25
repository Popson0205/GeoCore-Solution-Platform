"""Unauthenticated, read-only endpoints for a project's shareable link
(blueprint section 7's "explicit, secure sharing mechanism" and section 18,
which frames reports as being for communicating results outward).

None of these depend on get_current_user. Access is instead gated purely by
knowing the project's `share_token`, and only while `share_enabled` is True
— both are controlled by a Project Manager+ via routes/projects.py. Every
lookup here filters by (share_token AND share_enabled) together and returns
a generic 404 either way, so a disabled or wrong token can't be used to
probe for a project's existence.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload

from backend.app.core.database import get_db
from backend.app.models.asset_type import AssetType
from backend.app.models.project import Project
from backend.app.models.record import Record
from backend.app.models.report import Report
from backend.app.schemas.asset_type import AssetTypeOut
from backend.app.schemas.project import ProjectOut
from backend.app.schemas.record import RecordOut
from backend.app.schemas.report import ReportOut

router = APIRouter()


def _get_shared_project(db: Session, token: str) -> Project:
    project = (
        db.query(Project)
        .filter(Project.share_token == token, Project.share_enabled.is_(True))
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="This share link is invalid or disabled")
    return project


@router.get("/{token}/project", response_model=ProjectOut)
def public_project(token: str, db: Session = Depends(get_db)):
    return _get_shared_project(db, token)


@router.get("/{token}/asset-types", response_model=list[AssetTypeOut])
def public_asset_types(token: str, db: Session = Depends(get_db)):
    project = _get_shared_project(db, token)
    return (
        db.query(AssetType)
        .options(selectinload(AssetType.field_definitions))
        .filter(AssetType.project_id == project.id)
        .all()
    )


@router.get("/{token}/records", response_model=list[RecordOut])
def public_records(token: str, db: Session = Depends(get_db)):
    project = _get_shared_project(db, token)
    return (
        db.query(Record)
        .filter(Record.project_id == project.id)
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
