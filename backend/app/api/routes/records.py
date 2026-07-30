import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import (
    get_organisation_for_member,
    get_project_for_member,
    get_survey_for_member,
    require_project_role,
    require_survey_role,
)
from backend.app.core.data_import import ImportError_, parse_import_file
from backend.app.core.database import get_db
from backend.app.core.form_engine import FormValidationError, process_submission
from backend.app.core.roles import DATA_COLLECTOR, PROJECT_MANAGER
from backend.app.models.asset_type import AssetType
from backend.app.models.record import Record
from backend.app.models.survey import Survey
from backend.app.models.user import User
from backend.app.schemas.record import (
    ImportSummary,
    RecordCreate,
    RecordGeometryOut,
    RecordOut,
    RecordUpdate,
)

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_IMPORT_ROWS = 5000


def _get_asset_type_in_survey(db: Session, asset_type_id: uuid.UUID, survey_id: uuid.UUID) -> AssetType:
    asset_type = (
        db.query(AssetType)
        .filter(AssetType.id == asset_type_id, AssetType.survey_id == survey_id)
        .first()
    )
    if not asset_type:
        raise HTTPException(status_code=404, detail="Asset type not found in this survey")
    return asset_type


# ---------------------------------------------------------------------------
# Survey-scoped create (Portal redesign Phase 2, this Phase 6) — records are
# collected against a Survey's asset types, so creation is keyed by
# survey_id directly rather than resolved indirectly through a project.
# ---------------------------------------------------------------------------


@router.post("/surveys/{survey_id}/records", response_model=RecordOut, status_code=201)
def create_record_for_survey(
    survey_id: uuid.UUID,
    payload: RecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Collecting data is the Data Collector role's whole job — Analyst and
    # Viewer stay read-only (blueprint section 13).
    survey, _ = require_survey_role(db, survey_id, current_user.id, DATA_COLLECTOR)
    asset_type = _get_asset_type_in_survey(db, payload.asset_type_id, survey_id)

    # Authoritative pass: evaluates skip logic, recomputes calculated
    # fields server-side, and validates — never persist raw client
    # field_data directly (blueprint section 12 & 19: validation can't
    # live only in the frontend).
    try:
        processed_field_data = process_submission(asset_type, payload.field_data)
    except FormValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors)

    record = Record(
        organisation_id=survey.organisation_id,
        survey_id=survey.id,
        # Copied over from the survey purely as an optional folder tag on
        # the record (Portal redesign Phase 1/2) — not used for scoping.
        project_id=survey.project_id,
        asset_type_id=payload.asset_type_id,
        geometry=payload.geometry.model_dump(),
        field_data=processed_field_data,
        created_by=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


# ---------------------------------------------------------------------------
# Organisation-wide (Portal-scoped) reads — the actual "queryable at the
# Portal, not walled in a Project" behaviour (Portal redesign Phase 2, this
# Phase 6).
# ---------------------------------------------------------------------------


@router.get("/organisations/{organisation_id}/records", response_model=list[RecordOut])
def list_records_for_organisation(
    organisation_id: uuid.UUID,
    survey_id: uuid.UUID | None = None,
    asset_type_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_organisation_for_member(db, organisation_id, current_user.id)
    query = db.query(Record).filter(Record.organisation_id == organisation_id)
    if survey_id:
        query = query.filter(Record.survey_id == survey_id)
    if asset_type_id:
        query = query.filter(Record.asset_type_id == asset_type_id)
    return query.order_by(Record.created_at.desc()).all()


@router.get(
    "/organisations/{organisation_id}/records/geometry",
    response_model=list[RecordGeometryOut],
)
def list_record_geometry_for_organisation(
    organisation_id: uuid.UUID,
    survey_id: uuid.UUID | None = None,
    asset_type_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lightweight, map-only shape (id/asset_type_id/survey_id/geometry) —
    a Portal-wide map pulling every record across every survey doesn't
    need each record's full field_data on the wire. Equivalent to
    `GET /organisations/{id}/records?geometry=true` in the 10-phase plan,
    split into its own path so the two response shapes stay independently
    typed (see RecordGeometryOut).
    """
    get_organisation_for_member(db, organisation_id, current_user.id)
    query = db.query(Record).filter(Record.organisation_id == organisation_id)
    if survey_id:
        query = query.filter(Record.survey_id == survey_id)
    if asset_type_id:
        query = query.filter(Record.asset_type_id == asset_type_id)
    return query.all()


# ---------------------------------------------------------------------------
# Deprecated project-scoped routes — kept so clients still built against the
# old shape keep working (Portal redesign Phase 2, this Phase 6). New
# integrations should use the survey/organisation-scoped routes above.
# ---------------------------------------------------------------------------


@router.post(
    "/projects/{project_id}/records",
    response_model=RecordOut,
    status_code=201,
    deprecated=True,
)
def create_record(
    project_id: uuid.UUID,
    payload: RecordCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deprecated — creation now happens under a Survey, not a Project
    directly (use `POST /surveys/{survey_id}/records`). Kept for old
    clients: resolves the asset type's own survey and requires that
    survey to be filed under this project.
    """
    require_project_role(db, project_id, current_user.id, DATA_COLLECTOR)
    response.headers["Deprecation"] = "true"
    logger.warning(
        "Deprecated route called: POST /projects/%s/records "
        "(use POST /surveys/{survey_id}/records instead)",
        project_id,
    )

    asset_type = (
        db.query(AssetType)
        .join(Survey, Survey.id == AssetType.survey_id)
        .filter(AssetType.id == payload.asset_type_id, Survey.project_id == project_id)
        .first()
    )
    if not asset_type:
        raise HTTPException(status_code=404, detail="Asset type not found in this project")

    try:
        processed_field_data = process_submission(asset_type, payload.field_data)
    except FormValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors)

    record = Record(
        organisation_id=asset_type.survey.organisation_id,
        survey_id=asset_type.survey_id,
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


@router.get(
    "/projects/{project_id}/records", response_model=list[RecordOut], deprecated=True
)
def list_records(
    project_id: uuid.UUID,
    response: Response,
    asset_type_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deprecated — use `GET /organisations/{organisation_id}/records`,
    filtered by survey_id if needed. Kept for old clients: resolves every
    Survey filed under this project and returns their combined records.
    """
    get_project_for_member(db, project_id, current_user.id)
    response.headers["Deprecation"] = "true"
    logger.warning(
        "Deprecated route called: GET /projects/%s/records "
        "(use GET /organisations/{organisation_id}/records instead)",
        project_id,
    )

    survey_ids = [row[0] for row in db.query(Survey.id).filter(Survey.project_id == project_id).all()]
    if not survey_ids:
        return []
    query = db.query(Record).filter(Record.survey_id.in_(survey_ids))
    if asset_type_id:
        query = query.filter(Record.asset_type_id == asset_type_id)
    return query.order_by(Record.created_at.desc()).all()


def _get_record_for_member(db: Session, record_id: uuid.UUID, user: User) -> Record:
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    get_survey_for_member(db, record.survey_id, user.id)
    return record


def _get_record_for_role(db: Session, record_id: uuid.UUID, user: User, minimum: str) -> Record:
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    require_survey_role(db, record.survey_id, user.id, minimum)
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


@router.post(
    "/projects/{project_id}/records/import",
    response_model=ImportSummary,
    deprecated=True,
)
async def import_records(
    project_id: uuid.UUID,
    response: Response,
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

    Deprecated (Portal redesign Phase 2, this Phase 6) along with the rest
    of the project-scoped record routes above — kept working for old
    clients by resolving the asset type through its survey.
    """
    require_project_role(db, project_id, current_user.id, DATA_COLLECTOR)
    response.headers["Deprecation"] = "true"
    logger.warning(
        "Deprecated route called: POST /projects/%s/records/import", project_id
    )

    asset_type = (
        db.query(AssetType)
        .join(Survey, Survey.id == AssetType.survey_id)
        .filter(AssetType.id == asset_type_id, Survey.project_id == project_id)
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
                organisation_id=asset_type.survey.organisation_id,
                survey_id=asset_type.survey_id,
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
