import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import (
    get_project_for_member,
    get_survey_for_member,
    require_org_role,
    require_survey_role,
)
from backend.app.core.data_import import ImportError_, parse_import_file
from backend.app.core.database import get_db
from backend.app.core.form_engine import FormValidationError, process_submission
from backend.app.core.roles import DATA_COLLECTOR, PROJECT_MANAGER, VIEWER
from backend.app.models.asset_type import AssetType
from backend.app.models.record import Record
from backend.app.models.survey import Survey
from backend.app.models.user import User
from backend.app.schemas.record import (
    ImportSummary,
    RecordCreate,
    RecordListItem,
    RecordOut,
    RecordUpdate,
)

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_IMPORT_ROWS = 5000


def _record_list_item(record: Record, include_geometry: bool) -> RecordListItem:
    """Shape a record for the organisation-/survey-wide listing endpoints.
    Geometry is only carried when the caller asked for it (?geometry=true),
    since a GeoJSON polygon can be far larger than the rest of the row and
    these listings can span an entire organisation.
    """
    return RecordListItem(
        id=record.id,
        organisation_id=record.organisation_id,
        survey_id=record.survey_id,
        asset_type_id=record.asset_type_id,
        project_id=record.project_id,
        geometry=record.geometry if include_geometry else None,
        field_data=record.field_data,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _asset_type_in_survey(db: Session, asset_type_id: uuid.UUID, survey_id: uuid.UUID) -> AssetType:
    asset_type = (
        db.query(AssetType)
        .filter(AssetType.id == asset_type_id, AssetType.survey_id == survey_id)
        .first()
    )
    if not asset_type:
        raise HTTPException(status_code=404, detail="Asset type not found in this survey")
    return asset_type


def _create_record(db: Session, survey: Survey, payload: RecordCreate, user: User) -> Record:
    """Create one record scoped to a survey. organisation_id/survey_id are the
    authoritative tenancy anchors (both NOT NULL); project_id is inherited from
    the survey purely as an optional folder tag (Portal redesign Phase 1).

    Authoritative pass: evaluates skip logic, recomputes calculated fields
    server-side, and validates — never persist raw client field_data directly
    (blueprint section 12 & 19: validation can't live only in the frontend).
    """
    asset_type = _asset_type_in_survey(db, payload.asset_type_id, survey.id)
    try:
        processed_field_data = process_submission(asset_type, payload.field_data)
    except FormValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors)

    record = Record(
        organisation_id=survey.organisation_id,
        survey_id=survey.id,
        asset_type_id=payload.asset_type_id,
        project_id=survey.project_id,
        geometry=payload.geometry.model_dump(),
        field_data=processed_field_data,
        created_by=user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def _survey_under_project(db: Session, asset_type_id: uuid.UUID, project_id: uuid.UUID) -> Survey:
    """Resolve the survey an asset type belongs to and confirm it's filed under
    the given project — the join the deprecated project-scoped routes need now
    that records are scoped by survey/organisation, not project.
    """
    asset_type = db.query(AssetType).filter(AssetType.id == asset_type_id).first()
    if not asset_type:
        raise HTTPException(status_code=404, detail="Asset type not found")
    survey = (
        db.query(Survey)
        .filter(Survey.id == asset_type.survey_id, Survey.project_id == project_id)
        .first()
    )
    if not survey:
        raise HTTPException(status_code=404, detail="Asset type not found in this project")
    return survey


@router.post("/surveys/{survey_id}/records", response_model=RecordOut, status_code=201)
def create_record(
    survey_id: uuid.UUID,
    payload: RecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Collecting data is the Data Collector role's whole job — Analyst and
    # Viewer stay read-only (blueprint section 13).
    survey, _ = require_survey_role(db, survey_id, current_user.id, DATA_COLLECTOR)
    return _create_record(db, survey, payload, current_user)


@router.get("/organisations/{organisation_id}/records", response_model=list[RecordListItem])
def list_organisation_records(
    organisation_id: uuid.UUID,
    survey_id: uuid.UUID | None = None,
    asset_type_id: uuid.UUID | None = None,
    geometry: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List every record across every survey in an organisation (Portal
    redesign Phase 1 — records are no longer walled inside a single Project).
    Any organisation member (Viewer+) can read. Optionally narrow to one survey
    or asset type. Geometry is omitted unless ?geometry=true, so a Portal-wide
    list stays light until a caller (e.g. a map view) actually needs it.
    """
    require_org_role(db, organisation_id, current_user.id, VIEWER)
    query = db.query(Record).filter(Record.organisation_id == organisation_id)
    if survey_id:
        query = query.filter(Record.survey_id == survey_id)
    if asset_type_id:
        query = query.filter(Record.asset_type_id == asset_type_id)
    records = query.order_by(Record.created_at.desc()).all()
    return [_record_list_item(r, include_geometry=geometry) for r in records]


@router.get("/surveys/{survey_id}/records", response_model=list[RecordListItem])
def list_survey_records(
    survey_id: uuid.UUID,
    asset_type_id: uuid.UUID | None = None,
    geometry: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_survey_for_member(db, survey_id, current_user.id)
    query = db.query(Record).filter(Record.survey_id == survey_id)
    if asset_type_id:
        query = query.filter(Record.asset_type_id == asset_type_id)
    records = query.order_by(Record.created_at.desc()).all()
    return [_record_list_item(r, include_geometry=geometry) for r in records]


@router.post(
    "/projects/{project_id}/records",
    response_model=RecordOut,
    status_code=201,
    deprecated=True,
)
def create_record_by_project(
    project_id: uuid.UUID,
    payload: RecordCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deprecated — records are now scoped to a Survey, not a Project directly
    (Portal redesign Phase 1). Kept so clients built against the old shape keep
    working: resolves the asset type's survey (confirming it's filed under this
    project) and forwards to the survey-scoped create. New integrations should
    call POST /surveys/{survey_id}/records directly.
    """
    response.headers["Deprecation"] = "true"
    logger.warning(
        "Deprecated route called: POST /projects/%s/records "
        "(use POST /surveys/{survey_id}/records instead)",
        project_id,
    )
    get_project_for_member(db, project_id, current_user.id)
    survey = _survey_under_project(db, payload.asset_type_id, project_id)
    require_survey_role(db, survey.id, current_user.id, DATA_COLLECTOR)
    return _create_record(db, survey, payload, current_user)


@router.get(
    "/projects/{project_id}/records",
    response_model=list[RecordOut],
    deprecated=True,
)
def list_records_by_project(
    project_id: uuid.UUID,
    response: Response,
    asset_type_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deprecated — records now belong to Surveys, not Projects (Portal
    redesign Phase 1). Resolves every Survey filed under this project and
    returns the union of their records, i.e. what the survey-scoped route would
    return for each combined. New integrations should call
    GET /organisations/{organisation_id}/records or
    GET /surveys/{survey_id}/records directly.
    """
    get_project_for_member(db, project_id, current_user.id)
    response.headers["Deprecation"] = "true"
    logger.warning(
        "Deprecated route called: GET /projects/%s/records "
        "(use GET /organisations/{organisation_id}/records instead)",
        project_id,
    )
    survey_ids = [
        row[0] for row in db.query(Survey.id).filter(Survey.project_id == project_id).all()
    ]
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
    # Auth resolves through the survey's organisation now, not the (optional,
    # nullable) project folder tag (Portal redesign Phase 1).
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


def _import_records(
    db: Session,
    survey: Survey,
    asset_type: AssetType,
    filename: str | None,
    content: bytes,
    user: User,
) -> ImportSummary:
    """Bulk-create records for a survey from an uploaded .csv/.json/.geojson
    file (blueprint section 2 — the fix for "data is stuck in spreadsheets").

    Every row goes through the exact same process_submission() engine a normal
    record uses — no reduced validation for bulk data. A bad row is reported
    and skipped; the whole file is never aborted on one mistake, since
    real-world spreadsheets are never perfectly clean.
    """
    field_keys = {f.field_key for f in asset_type.field_definitions}

    try:
        rows = parse_import_file(filename, content, asset_type.geometry_type, field_keys)
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
                organisation_id=survey.organisation_id,
                survey_id=survey.id,
                asset_type_id=asset_type.id,
                project_id=survey.project_id,
                geometry=row.geometry,
                field_data=processed_field_data,
                created_by=user.id,
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


@router.post("/surveys/{survey_id}/records/import", response_model=ImportSummary)
async def import_records(
    survey_id: uuid.UUID,
    asset_type_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Importing a hundred rows isn't a different kind of action than adding
    # one by hand, just more of them — same Data Collector+ floor.
    survey, _ = require_survey_role(db, survey_id, current_user.id, DATA_COLLECTOR)
    asset_type = _asset_type_in_survey(db, asset_type_id, survey_id)
    content = await file.read()
    return _import_records(db, survey, asset_type, file.filename, content, current_user)


@router.post(
    "/projects/{project_id}/records/import",
    response_model=ImportSummary,
    deprecated=True,
)
async def import_records_by_project(
    project_id: uuid.UUID,
    response: Response,
    asset_type_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deprecated — imports are now scoped to a Survey (Portal redesign Phase
    1). Resolves the asset type's survey (confirming it's filed under this
    project) and forwards to the survey-scoped import. New integrations should
    call POST /surveys/{survey_id}/records/import directly.
    """
    response.headers["Deprecation"] = "true"
    logger.warning(
        "Deprecated route called: POST /projects/%s/records/import "
        "(use POST /surveys/{survey_id}/records/import instead)",
        project_id,
    )
    get_project_for_member(db, project_id, current_user.id)
    survey = _survey_under_project(db, asset_type_id, project_id)
    require_survey_role(db, survey.id, current_user.id, DATA_COLLECTOR)
    asset_type = _asset_type_in_survey(db, asset_type_id, survey.id)
    content = await file.read()
    return _import_records(db, survey, asset_type, file.filename, content, current_user)
