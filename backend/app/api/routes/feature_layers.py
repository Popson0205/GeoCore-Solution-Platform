import secrets
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import (
    get_organisation_for_member,
    require_active_license,
    require_feature_layer_role,
    require_org_role,
)
from backend.app.core import content_visibility
from backend.app.core.data_import import ImportError_, parse_import_file
from backend.app.core.database import get_db
from backend.app.core.form_engine import FormValidationError, process_submission
from backend.app.core.roles import ADMINISTRATOR, DATA_COLLECTOR, VIEWER
from backend.app.models.feature_layer import FeatureLayer
from backend.app.models.project import Project
from backend.app.models.record import Record
from backend.app.models.survey import Survey
from backend.app.models.user import User
from backend.app.schemas.feature_layer import (
    FeatureLayerOut,
    FeatureLayerShareStatus,
    FeatureLayerUpdate,
)
from backend.app.schemas.record import ImportSummary, RecordOut

router = APIRouter()

MAX_IMPORT_ROWS = 5000


def _layer_out(layer: FeatureLayer, db: Session) -> FeatureLayerOut:
    out = FeatureLayerOut.model_validate(layer)
    out.record_count = db.query(func.count(Record.id)).filter(Record.feature_layer_id == layer.id).scalar() or 0
    out.survey_title = layer.survey.title if layer.survey else None
    return out


@router.get("/organisations/{organisation_id}/feature-layers", response_model=list[FeatureLayerOut])
def list_feature_layers(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every feature layer in the organisation this caller can see — the
    real, table-backed version of what used to be a computed view over
    Survey. This is what the Content page lists as a distinct item
    alongside its Survey, and what a Dashboard widget's "layer" picker
    binds to. A layer whose visibility is "private" is left out unless
    the caller created its Survey or is an Administrator+ — see
    core/content_visibility.py.
    """
    membership = require_org_role(db, organisation_id, current_user.id, VIEWER)
    layers = (
        db.query(FeatureLayer)
        .filter(FeatureLayer.organisation_id == organisation_id)
        .order_by(FeatureLayer.created_at.desc())
        .all()
    )
    survey_creators = dict(
        db.query(Survey.id, Survey.created_by).filter(Survey.organisation_id == organisation_id).all()
    )
    layers = [
        layer
        for layer in layers
        if content_visibility.can_view(
            layer.visibility, survey_creators.get(layer.survey_id), current_user.id, membership.role
        )
    ]
    counts = dict(
        db.query(Record.feature_layer_id, func.count(Record.id))
        .filter(Record.organisation_id == organisation_id)
        .group_by(Record.feature_layer_id)
        .all()
    )
    survey_titles = dict(
        db.query(Survey.id, Survey.title).filter(Survey.organisation_id == organisation_id).all()
    )
    project_names = dict(
        db.query(Project.id, Project.name).filter(Project.organisation_id == organisation_id).all()
    )
    out = []
    for layer in layers:
        row = FeatureLayerOut.model_validate(layer)
        row.record_count = counts.get(layer.id, 0)
        row.survey_title = survey_titles.get(layer.survey_id)
        row.project_name = project_names.get(layer.project_id) if layer.project_id else None
        out.append(row)
    return out


@router.get("/feature-layers/by-survey/{survey_id}", response_model=FeatureLayerOut)
def get_feature_layer_by_survey(
    survey_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Convenience lookup for the Survey Designer, which knows its own
    survey_id but not the twin FeatureLayer's id — geometry_type/color/
    visibility for the *data* all live on the FeatureLayer now, not the
    Survey's own (legacy, unused) columns of the same name.
    """
    layer = db.query(FeatureLayer).filter(FeatureLayer.survey_id == survey_id).first()
    if not layer:
        raise HTTPException(status_code=404, detail="This survey has no feature layer")
    layer, membership = require_feature_layer_role(db, layer.id, current_user.id, VIEWER)
    creator = layer.survey.created_by if layer.survey else None
    if not content_visibility.can_view(layer.visibility, creator, current_user.id, membership.role):
        raise HTTPException(status_code=404, detail="Feature layer not found")
    return _layer_out(layer, db)


@router.get("/feature-layers/{feature_layer_id}", response_model=FeatureLayerOut)
def get_feature_layer(
    feature_layer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    layer, membership = require_feature_layer_role(db, feature_layer_id, current_user.id, VIEWER)
    creator = layer.survey.created_by if layer.survey else None
    if not content_visibility.can_view(layer.visibility, creator, current_user.id, membership.role):
        raise HTTPException(status_code=404, detail="Feature layer not found")
    return _layer_out(layer, db)


@router.patch("/feature-layers/{feature_layer_id}", response_model=FeatureLayerOut)
def update_feature_layer(
    feature_layer_id: uuid.UUID,
    payload: FeatureLayerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Settings — rename, restyle, change geometry type, or change who can
    see it (visibility). Reserved for Administrator+ (same bar as Project
    settings), since this affects every widget/map already bound to this
    layer, not just this layer's own view. Switching visibility to
    "public" generates a share_token automatically if one doesn't exist
    yet — no separate "enable sharing" step needed.
    """
    layer, _ = require_feature_layer_role(db, feature_layer_id, current_user.id, ADMINISTRATOR)
    if payload.name is not None:
        layer.name = payload.name
    if payload.description is not None:
        layer.description = payload.description or None
    if payload.geometry_type is not None:
        layer.geometry_type = payload.geometry_type
    if payload.color is not None:
        layer.color = payload.color
    if payload.visibility is not None:
        layer.visibility = payload.visibility
        if payload.visibility == "public" and not layer.share_token:
            layer.share_token = secrets.token_urlsafe(24)
    db.commit()
    db.refresh(layer)
    return _layer_out(layer, db)


@router.get("/feature-layers/{feature_layer_id}/share", response_model=FeatureLayerShareStatus)
def get_share_status(
    feature_layer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    layer, _ = require_feature_layer_role(db, feature_layer_id, current_user.id, ADMINISTRATOR)
    enabled = layer.visibility == "public"
    return FeatureLayerShareStatus(
        enabled=enabled,
        token=layer.share_token if enabled else None,
        public_path=f"/layers/{layer.share_token}" if (enabled and layer.share_token) else None,
    )


@router.post("/feature-layers/{feature_layer_id}/share/rotate", response_model=FeatureLayerShareStatus)
def rotate_share_link(
    feature_layer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Invalidates the current public link and issues a new one — only
    meaningful once visibility is already "public" (see
    update_feature_layer above for how a layer gets there in the first
    place).
    """
    layer, _ = require_feature_layer_role(db, feature_layer_id, current_user.id, ADMINISTRATOR)
    if layer.visibility != "public":
        raise HTTPException(
            status_code=422, detail="Set this layer's visibility to Public before rotating its link."
        )
    layer.share_token = secrets.token_urlsafe(24)
    db.commit()
    db.refresh(layer)
    return FeatureLayerShareStatus(enabled=True, token=layer.share_token, public_path=f"/layers/{layer.share_token}")


@router.get("/feature-layers/{feature_layer_id}/records", response_model=list[RecordOut])
def list_layer_records(
    feature_layer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    layer, membership = require_feature_layer_role(db, feature_layer_id, current_user.id, VIEWER)
    creator = layer.survey.created_by if layer.survey else None
    if not content_visibility.can_view(layer.visibility, creator, current_user.id, membership.role):
        raise HTTPException(status_code=404, detail="Feature layer not found")
    return (
        db.query(Record)
        .filter(Record.feature_layer_id == feature_layer_id)
        .order_by(Record.created_at.desc())
        .all()
    )


@router.post("/feature-layers/{feature_layer_id}/records/import", response_model=ImportSummary)
async def import_records(
    feature_layer_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-create records from an uploaded .csv, .json, or .geojson file —
    the "upload data" half of a feature layer, alongside filling out the
    Survey's own form one record at a time. Every row goes through the
    same process_submission() engine a normal record uses — no reduced
    validation for bulk data. A bad row is reported and skipped; the
    whole file is never aborted on one mistake.
    """
    layer, _ = require_feature_layer_role(db, feature_layer_id, current_user.id, DATA_COLLECTOR)
    require_active_license(db, layer.organisation_id)

    survey = layer.survey
    content = await file.read()
    field_keys = {f.field_key for f in survey.field_definitions}

    try:
        rows = parse_import_file(file.filename, content, layer.geometry_type, field_keys)
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
                organisation_id=layer.organisation_id,
                survey_id=survey.id,
                feature_layer_id=layer.id,
                project_id=layer.project_id,
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
        errors=errors[:200],
    )
