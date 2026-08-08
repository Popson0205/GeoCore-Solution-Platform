"""Land records — the legal documents (deeds, plats, subdivision plans,
records of survey) that create or retire parcels. See models/land_record.py
for the reasoning; this is the "records-driven" half of a real parcel
fabric, researched from Esri's parcel fabric documentation and general
cadastre/LIS literature before building any of it (see conversation).

Part of GeoCore Estate's Phase 1 (parcel data model + land records).
Parcel lineage itself (Record.parent_record_id/status, split/merge
workflows) is Phase 2, built on top of what's here.
"""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import require_org_role
from backend.app.core.database import get_db
from backend.app.core.roles import PROJECT_MANAGER, VIEWER
from backend.app.core.storage import resolve_upload, save_upload
from backend.app.models.land_record import LandRecord
from backend.app.models.record import Record
from backend.app.models.user import User
from backend.app.schemas.land_record import LandRecordCreate, LandRecordOut, LandRecordUpdate

router = APIRouter()


def _to_out(land_record: LandRecord, parcel_count: int = 0) -> LandRecordOut:
    out = LandRecordOut.model_validate(land_record)
    out.parcel_count = parcel_count
    return out


@router.post("/organisations/{organisation_id}/land-records", response_model=LandRecordOut)
def create_land_record(
    organisation_id: uuid.UUID,
    payload: LandRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_org_role(db, organisation_id, current_user.id, PROJECT_MANAGER)
    land_record = LandRecord(
        organisation_id=organisation_id,
        project_id=payload.project_id,
        record_type=payload.record_type,
        record_number=payload.record_number,
        record_date=payload.record_date,
        description=payload.description,
        created_by=current_user.id,
    )
    db.add(land_record)
    db.commit()
    db.refresh(land_record)
    return _to_out(land_record)


@router.get("/organisations/{organisation_id}/land-records", response_model=list[LandRecordOut])
def list_land_records(
    organisation_id: uuid.UUID,
    record_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_org_role(db, organisation_id, current_user.id, VIEWER)
    query = db.query(LandRecord).filter(LandRecord.organisation_id == organisation_id)
    if record_type:
        query = query.filter(LandRecord.record_type == record_type)
    land_records = query.order_by(LandRecord.created_at.desc()).all()

    counts = dict(
        db.query(Record.land_record_id, func.count(Record.id))
        .filter(Record.land_record_id.in_([lr.id for lr in land_records]))
        .group_by(Record.land_record_id)
        .all()
    ) if land_records else {}

    return [_to_out(lr, counts.get(lr.id, 0)) for lr in land_records]


def _get_land_record_for_member(db: Session, land_record_id: uuid.UUID, user: User) -> LandRecord:
    land_record = db.query(LandRecord).filter(LandRecord.id == land_record_id).first()
    if not land_record:
        raise HTTPException(status_code=404, detail="Land record not found")
    require_org_role(db, land_record.organisation_id, user.id, VIEWER)
    return land_record


@router.get("/land-records/{land_record_id}", response_model=LandRecordOut)
def get_land_record(
    land_record_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    land_record = _get_land_record_for_member(db, land_record_id, current_user)
    count = db.query(Record).filter(Record.land_record_id == land_record.id).count()
    return _to_out(land_record, count)


@router.patch("/land-records/{land_record_id}", response_model=LandRecordOut)
def update_land_record(
    land_record_id: uuid.UUID,
    payload: LandRecordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    land_record = db.query(LandRecord).filter(LandRecord.id == land_record_id).first()
    if not land_record:
        raise HTTPException(status_code=404, detail="Land record not found")
    require_org_role(db, land_record.organisation_id, current_user.id, PROJECT_MANAGER)

    if payload.record_type is not None:
        land_record.record_type = payload.record_type
    if payload.record_number is not None:
        land_record.record_number = payload.record_number
    if payload.record_date is not None:
        land_record.record_date = payload.record_date
    if payload.description is not None:
        land_record.description = payload.description

    db.commit()
    db.refresh(land_record)
    count = db.query(Record).filter(Record.land_record_id == land_record.id).count()
    return _to_out(land_record, count)


@router.delete("/land-records/{land_record_id}", status_code=204)
def delete_land_record(
    land_record_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    land_record = db.query(LandRecord).filter(LandRecord.id == land_record_id).first()
    if not land_record:
        raise HTTPException(status_code=404, detail="Land record not found")
    require_org_role(db, land_record.organisation_id, current_user.id, PROJECT_MANAGER)

    # A land record that created/retired real parcels is load-bearing —
    # deleting it would leave those parcels' lineage pointing at nothing.
    # Retire the parcels first (Phase 2), or leave this document in place
    # as the historical record it actually is.
    linked = db.query(Record).filter(Record.land_record_id == land_record.id).count()
    if linked > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Can't delete — {linked} parcel(s) reference this as the record that created or retired them.",
        )

    db.delete(land_record)
    db.commit()
    return None


@router.post("/land-records/{land_record_id}/document", response_model=LandRecordOut)
async def upload_land_record_document(
    land_record_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """One document per land record (a scanned deed/plat) — uploading again
    replaces whatever was there before, rather than accumulating multiple
    files the way Attachments does for a Record's photos. That matches
    what a land record actually is: one authoritative document.
    """
    land_record = db.query(LandRecord).filter(LandRecord.id == land_record_id).first()
    if not land_record:
        raise HTTPException(status_code=404, detail="Land record not found")
    require_org_role(db, land_record.organisation_id, current_user.id, PROJECT_MANAGER)

    content = await file.read()
    storage_path, size_bytes = save_upload(land_record.id, file.filename, content)
    land_record.document_file_name = file.filename
    land_record.document_content_type = file.content_type
    land_record.document_size_bytes = size_bytes
    land_record.document_storage_path = storage_path
    db.commit()
    db.refresh(land_record)
    count = db.query(Record).filter(Record.land_record_id == land_record.id).count()
    return _to_out(land_record, count)


@router.get("/land-records/{land_record_id}/document")
def download_land_record_document(
    land_record_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    land_record = _get_land_record_for_member(db, land_record_id, current_user)
    if not land_record.document_storage_path:
        raise HTTPException(status_code=404, detail="No document uploaded for this land record")
    path = resolve_upload(land_record.document_storage_path)
    return FileResponse(path, media_type=land_record.document_content_type, filename=land_record.document_file_name)
