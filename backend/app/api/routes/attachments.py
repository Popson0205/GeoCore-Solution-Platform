import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import get_project_for_member
from backend.app.core.database import get_db
from backend.app.core.storage import resolve_upload, save_upload
from backend.app.models.attachment import Attachment
from backend.app.models.record import Record
from backend.app.models.user import User
from backend.app.schemas.attachment import AttachmentOut

router = APIRouter()

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB


def _attachment_to_out(attachment: Attachment) -> AttachmentOut:
    return AttachmentOut(
        id=attachment.id,
        record_id=attachment.record_id,
        file_name=attachment.file_name,
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
        url=f"/api/attachments/{attachment.id}/file",
        created_at=attachment.created_at,
    )


def _get_record_for_member(db: Session, record_id: uuid.UUID, user: User) -> Record:
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    get_project_for_member(db, record.project_id, user.id)
    return record


@router.post(
    "/records/{record_id}/attachments", response_model=AttachmentOut, status_code=201
)
async def upload_attachment(
    record_id: uuid.UUID,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = _get_record_for_member(db, record_id, current_user)

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 15 MB upload limit")

    relative_path, size_bytes = save_upload(record.id, file.filename or "upload", content)

    attachment = Attachment(
        record_id=record.id,
        file_name=file.filename or "upload",
        content_type=file.content_type,
        size_bytes=size_bytes,
        storage_path=relative_path,
        uploaded_by=current_user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return _attachment_to_out(attachment)


@router.get("/records/{record_id}/attachments", response_model=list[AttachmentOut])
def list_attachments(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_record_for_member(db, record_id, current_user)
    attachments = (
        db.query(Attachment)
        .filter(Attachment.record_id == record_id)
        .order_by(Attachment.created_at.desc())
        .all()
    )
    return [_attachment_to_out(a) for a in attachments]


@router.get("/attachments/{attachment_id}/file")
def download_attachment(
    attachment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attachment = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    _get_record_for_member(db, attachment.record_id, current_user)

    path = resolve_upload(attachment.storage_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File is missing from storage")
    return FileResponse(path, media_type=attachment.content_type, filename=attachment.file_name)


@router.delete("/attachments/{attachment_id}", status_code=204)
def delete_attachment(
    attachment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attachment = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    _get_record_for_member(db, attachment.record_id, current_user)
    db.delete(attachment)
    db.commit()
    return None
