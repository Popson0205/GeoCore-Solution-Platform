import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import get_project_for_member, require_project_role
from backend.app.core.data_import import ImportError_, parse_import_file
from backend.app.core.database import get_db
from backend.app.core.form_engine import FormValidationError, process_submission
from backend.app.core.roles import DATA_COLLECTOR, PROJECT_MANAGER
from backend.app.models.asset_type import AssetType
from backend.app.models.record import Record
from backend.app.models.user import User
from backend.app.schemas.record import ImportSummary, RecordCreate, RecordOut, RecordUpdate

router = APIRouter()

MAX_IMPORT_ROWS = 5000


@router.post("/projects/{project_id}/records", response_model=RecordOut, status_code=201)
def create_record(
    project_id: uuid.UUID,
    payload: RecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Collecting data is the Data Collector role's whole job — Analyst and
    # Viewer stay read-only (blueprint section 13).
    require_project_role(db, project_id, current_user.id, DATA_COLLECTOR)

    asset_type = (
        db.query(AssetType)
        .filter(AssetType.id == payload.asset_type_id, AssetType.project_id == project_id)
        .first()
    )
    if not asset_type:
        raise HTTPException(status_code=404, detail="Asset type not found in this project")

    # Authoritative pass: evaluates skip logic, recomputes calculated
    # fields server-side, and validates — never persist raw client
    # field_data directly (blueprint section 12 & 19: validation can't
    # live only in the frontend).
    try:
        processed_field_data = process_submission(asset_type, payload.field_data)
    except FormValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors)

    record = Record(
        project_id=project_id,
        asset_type_id=payload.asset_type_id,
        geometry=payload.geometry.model_dump(),
        field_data=processed_field_data,
        created_by=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/projects/{project_id}/records", response_model=list[RecordOut])
def list_records(
    project_id: uuid.UUID,
    asset_type_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_for_member(db, project_id, current_user.id)
    query = db.query(Record).filter(Record.project_id == project_id)
    if asset_type_id:
        query = query.filter(Record.asset_type_id == asset_type_id)
    return query.order_by(Record.created_at.desc()).all()


def _get_record_for_member(db: Session, record_id: uuid.UUID, user: User) -> Record:
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    get_project_for_member(db, record.project_id, user.id)
    return record


def _get_record_for_role(db: Session, record_id: uuid.UUID, user: User, minimum: str) -> Record:
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    require_project_role(db, record.project_id, user.id, minimum)
    return record


@router.get("/records/{record_id}", response_model=RecordOut)
def get_record(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_record_for_member(db, record_id, current_user)


@router.patch("/records/{record_id}", response_model=RecordOut)
def update_record(
    record_id: uuid.UUID,
    payload: RecordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = _get_record_for_role(db, record_id, current_user, DATA_COLLECTOR)
    if payload.geometry is not None:
        record.geometry = payload.geometry.model_dump()
    if payload.field_data is not None:
        try:
            record.field_data = process_submission(record.asset_type, payload.field_data)
        except FormValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/records/{record_id}", status_code=204)
def delete_record(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Deleting (vs. correcting) a record is reserved for Project Manager+
    # so a field worker can't accidentally wipe collected data — they can
    # still fix mistakes via PATCH above.
    record = _get_record_for_role(db, record_id, current_user, PROJECT_MANAGER)
    db.delete(record)
    db.commit()
    return None


@router.post("/projects/{project_id}/records/import", response_model=ImportSummary)
async def import_records(
    project_id: uuid.UUID,
    asset_type_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-create records from an uploaded .csv, .json, or .geojson file
    (blueprint section 2 — this is the fix for "data is stuck in
    spreadsheets"). Same permission as creating one record by hand
    (Data Collector+): importing a hundred rows isn't a different kind of
    action than adding one, just more of them.

    Every row goes through the exact same process_submission() engine a
    normal record uses — no reduced validation for bulk data. A bad row
    is reported and skipped; the whole file is never aborted on one
    mistake, since real-world spreadsheets are never perfectly clean.
    """
    require_project_role(db, project_id, current_user.id, DATA_COLLECTOR)

    asset_type = (
        db.query(AssetType)
        .filter(AssetType.id == asset_type_id, AssetType.project_id == project_id)
        .first()
    )
    if not asset_type:
        raise HTTPException(status_code=404, detail="Asset type not found in this project")

    content = await file.read()
    field_keys = {f.field_key for f in asset_type.field_definitions}

    try:
        rows = parse_import_file(file.filename, content, asset_type.geometry_type, field_keys)
    except (ImportError_, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if len(rows) > MAX_IMPORT_ROWS:
        raise HTTPException(
            status_code=422,
            detail=f"This file has {len(rows)} rows — imports are capped at {MAX_IMPORT_ROWS} per upload. Split it into smaller files.",
        )

    created = 0
    errors = []
    for row in rows:
        if row.error:
            errors.append({"line": row.line_number, "message": row.error})
            continue
        try:
            processed_field_data = process_submission(asset_type, row.field_data)
        except FormValidationError as exc:
            errors.append({"line": row.line_number, "message": "; ".join(exc.errors)})
            continue

        db.add(
            Record(
                project_id=project_id,
                asset_type_id=asset_type_id,
                geometry=row.geometry,
                field_data=processed_field_data,
                created_by=current_user.id,
            )
        )
        created += 1

    db.commit()

    return ImportSummary(
        total_rows=len(rows),
        created=created,
        skipped=len(errors),
        errors=errors[:200],  # cap the echoed error list so a badly-formed file doesn't blow up the response
    )
