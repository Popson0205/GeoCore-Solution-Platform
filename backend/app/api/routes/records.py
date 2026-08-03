import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import (
    get_organisation_for_member,
    get_project_for_member,
    get_survey_for_member,
    require_active_license,
    require_project_role,
    require_survey_role,
)
from backend.app.core.audit import log_action
from backend.app.core.data_import import ImportError_, backfill_location_fields, parse_import_file
from backend.app.core.database import get_db
from backend.app.core.form_engine import FormValidationError, process_submission
from backend.app.core.rate_limit import get_client_ip
from backend.app.core.roles import DATA_COLLECTOR, PROJECT_MANAGER
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


# ---------------------------------------------------------------------------
# Survey-scoped create — one Record == one filled-out Survey form (flat
# Survey123/KoBo model). A record is created directly against a Survey;
# there's no intermediate asset type to resolve any more.
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
    require_active_license(db, survey.organisation_id)

    # Fill in latitude/longitude from the submitted geometry BEFORE
    # validation runs — these are marked required (see
    # _ensure_location_fields), and someone filling out the form only
    # interacts with the map click, never typing coordinates directly.
    # Backfilling after validation would be too late: the required-field
    # check would already have rejected the submission.
    field_data = dict(payload.field_data)
    backfill_location_fields(
        field_data, payload.geometry.model_dump(), {f.field_key for f in survey.field_definitions}
    )

    # Authoritative pass: evaluates skip logic, recomputes calculated
    # fields server-side, and validates — never persist raw client
    # field_data directly (blueprint section 12 & 19: validation can't
    # live only in the frontend).
    try:
        processed_field_data = process_submission(survey, field_data)
    except FormValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors)

    if not survey.feature_layer:
        # Shouldn't happen post-migration (every Survey gets one at
        # creation time) — but a clear 500 with a real explanation beats
        # an AttributeError on .id below if it ever does.
        raise HTTPException(
            status_code=500,
            detail="This survey has no feature layer to write records into. Contact support.",
        )

    record = Record(
        organisation_id=survey.organisation_id,
        survey_id=survey.id,
        feature_layer_id=survey.feature_layer.id,
        # Copied over from the survey purely as an optional folder tag on
        # the record — not used for scoping.
        project_id=survey.project_id,
        geometry=payload.geometry.model_dump(),
        field_data=processed_field_data,
        created_by=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


# ---------------------------------------------------------------------------
# Organisation-wide (Portal-scoped) reads — every record across every
# survey in the organisation, filterable by survey_id.
# ---------------------------------------------------------------------------


@router.get("/organisations/{organisation_id}/records", response_model=list[RecordOut])
def list_records_for_organisation(
    organisation_id: uuid.UUID,
    survey_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_organisation_for_member(db, organisation_id, current_user.id)
    query = db.query(Record).filter(Record.organisation_id == organisation_id)
    if survey_id:
        query = query.filter(Record.survey_id == survey_id)
    return query.order_by(Record.created_at.desc()).all()


@router.get(
    "/organisations/{organisation_id}/records/geometry",
    response_model=list[RecordGeometryOut],
)
def list_record_geometry_for_organisation(
    organisation_id: uuid.UUID,
    survey_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lightweight, map-only shape (id/survey_id/geometry) — a Portal-wide
    map pulling every record across every survey doesn't need each
    record's full field_data on the wire. Equivalent to
    `GET /organisations/{id}/records?geometry=true` in the 10-phase plan,
    split into its own path so the two response shapes stay independently
    typed (see RecordGeometryOut).
    """
    get_organisation_for_member(db, organisation_id, current_user.id)
    query = db.query(Record).filter(Record.organisation_id == organisation_id)
    if survey_id:
        query = query.filter(Record.survey_id == survey_id)
    return query.all()


# ---------------------------------------------------------------------------
# Deprecated project-scoped routes — kept so clients still built against the
# old shape keep working. New integrations should use the survey/
# organisation-scoped routes above.
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
    """Retired — creation now happens directly under a Survey (use
    `POST /surveys/{survey_id}/records`). The old version of this route
    resolved an `asset_type_id` from the request body to find the parent
    survey; that indirection no longer exists in the flat model, so this
    project-scoped variant can't be resolved any more and always 410s.
    """
    raise HTTPException(
        status_code=410,
        detail="This route is retired — create records via POST /surveys/{survey_id}/records instead.",
    )


@router.get(
    "/projects/{project_id}/records", response_model=list[RecordOut], deprecated=True
)
def list_records(
    project_id: uuid.UUID,
    response: Response,
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
    return (
        db.query(Record)
        .filter(Record.survey_id.in_(survey_ids))
        .order_by(Record.created_at.desc())
        .all()
    )


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
            record.field_data = process_submission(record.survey, payload.field_data)
        except FormValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/records/{record_id}", status_code=204)
def delete_record(
    record_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Deleting (vs. correcting) a record is reserved for Project Manager+
    # so a field worker can't accidentally wipe collected data — they can
    # still fix mistakes via PATCH above.
    record = _get_record_for_role(db, record_id, current_user, PROJECT_MANAGER)
    log_action(
        db,
        action="record.deleted",
        organisation_id=record.organisation_id,
        user_id=current_user.id,
        target_type="record",
        target_id=record.id,
        details={"survey_id": str(record.survey_id), "feature_layer_id": str(record.feature_layer_id)},
        ip_address=get_client_ip(request),
    )
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
    survey_id: uuid.UUID = Form(...),
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

    Deprecated along with the rest of the project-scoped record routes
    above — kept working for old clients by resolving the survey directly
    (formerly resolved through an asset type; the flat model made that
    indirection unnecessary).
    """
    require_project_role(db, project_id, current_user.id, DATA_COLLECTOR)
    response.headers["Deprecation"] = "true"
    logger.warning(
        "Deprecated route called: POST /projects/%s/records/import", project_id
    )

    survey = (
        db.query(Survey)
        .filter(Survey.id == survey_id, Survey.project_id == project_id)
        .first()
    )
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found in this project")
    require_active_license(db, survey.organisation_id)
    if not survey.feature_layer:
        raise HTTPException(
            status_code=500,
            detail="This survey has no feature layer to write records into. Contact support.",
        )

    content = await file.read()
    field_keys = {f.field_key for f in survey.field_definitions}

    try:
        rows = parse_import_file(file.filename, content, survey.geometry_type, field_keys)
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
            processed_field_data = process_submission(survey, row.field_data)
        except FormValidationError as exc:
            errors.append({"line": row.line_number, "message": "; ".join(exc.errors)})
            continue

        db.add(
            Record(
                organisation_id=survey.organisation_id,
                survey_id=survey.id,
                feature_layer_id=survey.feature_layer.id,
                project_id=project_id,
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
