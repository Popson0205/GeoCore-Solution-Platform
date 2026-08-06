import logging
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import (
    get_membership,
    require_active_license,
    require_org_role,
    require_survey_role,
)
from backend.app.core import content_visibility
from backend.app.core.audit import log_action
from backend.app.core.rate_limit import get_client_ip
from backend.app.core.database import get_db
from backend.app.core.roles import ADMINISTRATOR, OWNER, PROJECT_MANAGER, VIEWER
from backend.app.core.xlsform import ParsedForm, XLSFormError, parse_xlsform
from backend.app.models.feature_layer import FeatureLayer
from backend.app.models.project import Project
from backend.app.models.record import Record
from backend.app.models.survey import FieldDefinition, FormSection, Survey, SubmissionAssignee
from backend.app.models.survey_assignment import SurveyAssignment
from backend.app.models.user import User
from backend.app.schemas.survey import (
    AssigneeCreate,
    AssigneeOut,
    FieldDefinitionCreate,
    FormDefinition,
    FormSectionCreate,
    SubmissionEnableRequest,
    SubmissionStatusOut,
    SurveyCreate,
    SurveyOut,
    SurveyUpdate,
    XLSFormImportResult,
    slugify_key,
)
from backend.app.schemas.survey_assignment import SurveyAssignmentCreate, SurveyAssignmentOut

router = APIRouter()
logger = logging.getLogger(__name__)

# Eager-load a survey's form body + submission assignees together, so
# reading a survey back after a write never triggers a lazy round-trip per
# section/field/assignee.
_LOAD_OPTIONS = (
    selectinload(Survey.sections).selectinload(FormSection.fields),
    selectinload(Survey.field_definitions),
    selectinload(Survey.assignees),
)


def _survey_with_form(db: Session, survey_id: uuid.UUID) -> Survey:
    survey = db.query(Survey).options(*_LOAD_OPTIONS).filter(Survey.id == survey_id).first()
    if survey:
        # Not a mapped column — attached in-memory so SurveyOut's
        # from_attributes pickup finds it (see schemas/survey.py).
        survey.record_count = (
            db.query(func.count(Record.id)).filter(Record.survey_id == survey_id).scalar() or 0
        )
    return survey


def _validate_project(
    db: Session, organisation_id: uuid.UUID, project_id: uuid.UUID | None
) -> None:
    """A survey's optional folder project must live in the same organisation
    as the survey — otherwise a caller could file a survey under a project
    they can see the id of but that belongs to another tenant.
    """
    if project_id is None:
        return
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or project.organisation_id != organisation_id:
        raise HTTPException(status_code=404, detail="Project not found in this organisation")


# ---------------------------------------------------------------------------
# Form body helpers (moved down from the retired AssetType — a Survey now
# owns its own sections/fields directly, since the Survey *is* the form,
# Survey123/KoBo-style). Ported over unchanged from the old
# routes/asset_types.py's _replace_form/_add_field/_unique_key, just
# re-pointed from asset_type_id to survey_id.
# ---------------------------------------------------------------------------


def _unique_key(base: str, used: set[str]) -> str:
    key = base
    suffix = 1
    while key in used:
        suffix += 1
        key = f"{base}_{suffix}"
    used.add(key)
    return key


def _add_field(
    db: Session,
    survey_id: uuid.UUID,
    section_id: uuid.UUID | None,
    payload: FieldDefinitionCreate,
    sort_order: int,
    used_field_keys: set[str],
) -> None:
    base_key = payload.field_key if payload.field_key else slugify_key(payload.label)
    db.add(
        FieldDefinition(
            survey_id=survey_id,
            section_id=section_id,
            label=payload.label,
            field_key=_unique_key(base_key, used_field_keys),
            field_type=payload.field_type,
            options=payload.options,
            is_required=payload.is_required,
            sort_order=sort_order,
            visibility=payload.visibility.model_dump() if payload.visibility else None,
            calculation=payload.calculation,
            validation=payload.validation.model_dump(exclude_none=True)
            if payload.validation
            else None,
            placeholder=payload.placeholder,
            help_text=payload.help_text,
            appearance=payload.appearance,
        )
    )


def _replace_form(
    db: Session,
    survey: Survey,
    sections_payload: list[FormSectionCreate],
    legacy_fields_payload: list[FieldDefinitionCreate],
) -> None:
    """Delete this survey's existing sections/fields and recreate them from
    the given payload. Existing records keep whatever field_data they
    already have — renamed/removed fields just become inert extra keys on
    old records rather than being migrated, which is a deliberate MVP
    trade-off (see docs/CHANGES_FORM_BUILDER.md).
    """
    db.query(FormSection).filter(FormSection.survey_id == survey.id).delete()
    db.query(FieldDefinition).filter(
        FieldDefinition.survey_id == survey.id, FieldDefinition.section_id.is_(None)
    ).delete()
    db.flush()

    sections = list(sections_payload)
    if not sections and legacy_fields_payload:
        sections = [FormSectionCreate(title="General", fields=legacy_fields_payload)]

    used_section_keys: set[str] = set()
    used_field_keys: set[str] = set()

    for section_index, section_payload in enumerate(sections):
        section = FormSection(
            survey_id=survey.id,
            title=section_payload.title,
            description=section_payload.description,
            section_key=_unique_key(slugify_key(section_payload.title), used_section_keys),
            sort_order=section_index,
            repeatable=section_payload.repeatable,
            repeat_label=section_payload.repeat_label,
            visibility=section_payload.visibility.model_dump() if section_payload.visibility else None,
        )
        db.add(section)
        db.flush()
        for field_index, field_payload in enumerate(section_payload.fields):
            _add_field(db, survey.id, section.id, field_payload, field_index, used_field_keys)

    # A point-geometry survey's Latitude/Longitude fields can't actually
    # be deleted — if a form-replace payload leaves them out (e.g.
    # someone removed them in the builder), they're silently re-added
    # here rather than rejecting the request. See _ensure_location_fields.
    _ensure_location_fields(db, survey)


# ---------------------------------------------------------------------------
# Surveys — a Survey *is* the form (flat Survey123/KoBo model): create it
# with its form body in one call, the way Survey123/KoBo's form designer
# works, rather than creating an empty container and a separate "asset
# type" underneath it.
# ---------------------------------------------------------------------------


def _ensure_location_fields(db: Session, survey: Survey) -> None:
    """This is a geospatial platform — every point-geometry Survey gets
    explicit Latitude/Longitude fields automatically, so location is a
    real, visible field (shown in the Data table, in exports, in the
    form itself) rather than only living inside an internal geometry
    column nobody can see or map a CSV column to. This is what
    guarantees a data import always has an unambiguous column to match
    against for location — see core/data_import.py's handling of these
    two field_keys specifically.

    Line/polygon layers need more than one coordinate pair, so this only
    applies to "point" geometry. Idempotent: does nothing if the survey
    already has fields with these exact keys (a template or an XLSForm
    import may already define them), and safe to call again after a
    geometry_type change (see update_survey) without duplicating fields.
    """
    if survey.geometry_type != "point":
        return

    existing_keys = {
        row[0]
        for row in db.query(FieldDefinition.field_key).filter(FieldDefinition.survey_id == survey.id).all()
    }
    if "latitude" in existing_keys and "longitude" in existing_keys:
        return

    section = (
        db.query(FormSection)
        .filter(FormSection.survey_id == survey.id, FormSection.section_key == "location")
        .first()
    )
    if not section:
        max_section_order = (
            db.query(func.max(FormSection.sort_order)).filter(FormSection.survey_id == survey.id).scalar()
        )
        section = FormSection(
            survey_id=survey.id,
            title="Location",
            section_key="location",
            sort_order=(max_section_order if max_section_order is not None else -1) + 1,
        )
        db.add(section)
        db.flush()

    max_field_order = (
        db.query(func.max(FieldDefinition.sort_order))
        .filter(FieldDefinition.survey_id == survey.id, FieldDefinition.section_id == section.id)
        .scalar()
    )
    next_order = (max_field_order if max_field_order is not None else -1) + 1

    if "latitude" not in existing_keys:
        db.add(
            FieldDefinition(
                survey_id=survey.id,
                section_id=section.id,
                label="Latitude",
                field_key="latitude",
                field_type="number",
                is_required=True,
                sort_order=next_order,
            )
        )
        next_order += 1
    if "longitude" not in existing_keys:
        db.add(
            FieldDefinition(
                survey_id=survey.id,
                section_id=section.id,
                label="Longitude",
                field_key="longitude",
                field_type="number",
                is_required=True,
                sort_order=next_order,
            )
        )
    db.flush()


def _create_feature_layer_for_survey(db: Session, survey: Survey) -> FeatureLayer:
    """Every Survey gets exactly one FeatureLayer, created in the same
    transaction — the way ArcGIS Survey123 creates a Form item and a
    Feature Layer item together. The Survey defines the questions; the
    FeatureLayer is what Records actually belong to and what a
    Dashboard/Map binds to as a data source (see models/feature_layer.py).
    """
    layer = FeatureLayer(
        organisation_id=survey.organisation_id,
        project_id=survey.project_id,
        survey_id=survey.id,
        name=survey.title,
        geometry_type=survey.geometry_type,
        color=survey.color,
    )
    db.add(layer)
    db.flush()
    return layer


@router.post(
    "/organisations/{organisation_id}/surveys", response_model=SurveyOut, status_code=201
)
def create_survey(
    organisation_id: uuid.UUID,
    payload: SurveyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Same bar as creating a Project — Project Manager and above only
    # (blueprint section 13).
    require_org_role(db, organisation_id, current_user.id, PROJECT_MANAGER)
    require_active_license(db, organisation_id)
    _validate_project(db, organisation_id, payload.project_id)
    survey = Survey(
        organisation_id=organisation_id,
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        geometry_type=payload.geometry_type,
        color=payload.color,
        created_by=current_user.id,
    )
    db.add(survey)
    db.flush()
    _create_feature_layer_for_survey(db, survey)

    # The form body — sections/fields — is created in the same call, the
    # way Survey123/KoBo's "new form" workflow works. Optional: a survey
    # can also be created bare and have its form filled in afterwards via
    # PUT /surveys/{id}/form.
    if payload.sections or payload.fields:
        _replace_form(db, survey, payload.sections, payload.fields)

    _ensure_location_fields(db, survey)

    db.commit()
    return _survey_with_form(db, survey.id)


@router.get("/organisations/{organisation_id}/surveys", response_model=list[SurveyOut])
def list_surveys(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = require_org_role(db, organisation_id, current_user.id, VIEWER)
    surveys = (
        db.query(Survey)
        .options(*_LOAD_OPTIONS)
        .filter(Survey.organisation_id == organisation_id, Survey.deleted_at.is_(None))
        .all()
    )
    surveys = [
        s
        for s in surveys
        if content_visibility.can_view(s.visibility, s.created_by, current_user.id, membership.role)
    ]
    counts = dict(
        db.query(Record.survey_id, func.count(Record.id))
        .filter(Record.organisation_id == organisation_id)
        .group_by(Record.survey_id)
        .all()
    )
    for survey in surveys:
        survey.record_count = counts.get(survey.id, 0)
    return surveys


@router.get("/surveys/{survey_id}", response_model=SurveyOut)
def get_survey(
    survey_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Any organisation member may read; require_survey_role with VIEWER is the
    # membership + minimum-role check in one.
    survey, membership = require_survey_role(db, survey_id, current_user.id, VIEWER)
    if survey.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Survey not found")
    if not content_visibility.can_view(survey.visibility, survey.created_by, current_user.id, membership.role):
        raise HTTPException(status_code=404, detail="Survey not found")
    survey = _survey_with_form(db, survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    return survey


@router.patch("/surveys/{survey_id}", response_model=SurveyOut)
def update_survey(
    survey_id: uuid.UUID,
    payload: SurveyUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Renaming, restyling, or moving a survey. Also accepts a whole-form
    replace (`sections`/`fields`) as a convenience — equivalent to calling
    PUT /surveys/{id}/form separately.
    """
    survey, _ = require_survey_role(db, survey_id, current_user.id, PROJECT_MANAGER)
    if payload.title is not None:
        survey.title = payload.title
    if payload.description is not None:
        survey.description = payload.description
    if payload.status is not None:
        survey.status = payload.status
    if payload.geometry_type is not None:
        survey.geometry_type = payload.geometry_type
        db.flush()
        _ensure_location_fields(db, survey)
    if payload.color is not None:
        survey.color = payload.color
    if payload.visibility is not None:
        old_visibility = survey.visibility
        survey.visibility = payload.visibility
        if old_visibility != payload.visibility:
            log_action(
                db,
                action="survey.visibility_changed",
                organisation_id=survey.organisation_id,
                user_id=current_user.id,
                target_type="survey",
                target_id=survey.id,
                details={"old_visibility": old_visibility, "new_visibility": payload.visibility},
                ip_address=get_client_ip(request),
            )
    if payload.project_id is not None:
        _validate_project(db, survey.organisation_id, payload.project_id)
        survey.project_id = payload.project_id
    if payload.sections is not None or payload.fields is not None:
        _replace_form(db, survey, payload.sections or [], payload.fields or [])
    db.commit()
    return _survey_with_form(db, survey_id)


@router.put("/surveys/{survey_id}/form", response_model=SurveyOut)
def replace_form(
    survey_id: uuid.UUID,
    payload: FormDefinition,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace this survey's entire form — sections, fields, skip logic,
    calculations and validation rules — in one shot, the way a form
    builder's "Save form" action works. Existing records aren't migrated
    (see _replace_form's docstring).
    """
    survey, _ = require_survey_role(db, survey_id, current_user.id, PROJECT_MANAGER)
    _replace_form(db, survey, payload.sections, payload.fields)
    db.commit()
    return _survey_with_form(db, survey_id)


@router.delete("/surveys/{survey_id}", response_model=SurveyOut)
def trash_survey(
    survey_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Moves a survey (and its twin FeatureLayer, and every Record under
    it) to the trash — fully restorable for 7 days, then permanently
    purged (see core/trash.py). Reserved for administrator+, mirroring
    project deletion (blueprint section 13).
    """
    survey, _ = require_survey_role(db, survey_id, current_user.id, ADMINISTRATOR)
    survey.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return _survey_with_form(db, survey_id)


@router.post("/surveys/{survey_id}/restore", response_model=SurveyOut)
def restore_survey(
    survey_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    survey, _ = require_survey_role(db, survey_id, current_user.id, ADMINISTRATOR)
    survey.deleted_at = None
    db.commit()
    return _survey_with_form(db, survey_id)


@router.delete("/surveys/{survey_id}/permanent", status_code=204)
def permanently_delete_survey(
    survey_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Skips the 7-day trash window entirely — immediately and
    irreversibly deletes this survey, its twin FeatureLayer, and every
    Record under it. Reserved for Owner only (stricter than trashing,
    which is Administrator+), since there's no undo past this point.
    Also works on a survey that's still active (not yet trashed) — the
    Trash view is the expected way to reach this, but it isn't required.
    """
    survey, _ = require_survey_role(db, survey_id, current_user.id, OWNER)
    db.delete(survey)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Submission links — "field officer only needs the link" (blueprint §7).
# The link itself (token/enabled/access) and its assignees live directly on
# the Survey, since one Survey == one form a data collector fills out —
# there's no separate asset type layer to key these by any more.
# ---------------------------------------------------------------------------


def _submission_status(survey: Survey) -> SubmissionStatusOut:
    return SubmissionStatusOut(
        enabled=survey.submission_enabled,
        access=survey.submission_access,
        token=survey.submission_token if survey.submission_enabled else None,
        public_path=f"/submit/{survey.submission_token}"
        if (survey.submission_enabled and survey.submission_token)
        else None,
        assignees=[AssigneeOut.model_validate(a) for a in survey.assignees],
    )


@router.get("/surveys/{survey_id}/submission", response_model=SubmissionStatusOut)
def get_submission_status(
    survey_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    survey, _ = require_survey_role(db, survey_id, current_user.id, PROJECT_MANAGER)
    return _submission_status(survey)


@router.post("/surveys/{survey_id}/submission", response_model=SubmissionStatusOut)
def enable_submission(
    survey_id: uuid.UUID,
    payload: SubmissionEnableRequest,
    rotate: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Turn on this survey's submission link. `access="public"` means
    anyone with the link can submit with no login; `access="assigned"`
    restricts submissions to emails added via the assignees endpoints
    below. Either way, submissions still go through the exact same
    validation/calculation engine as an internal record (see
    routes/public.py -> core/form_engine.py) — the link only changes *who*
    can submit, never what's accepted.
    """
    survey, _ = require_survey_role(db, survey_id, current_user.id, PROJECT_MANAGER)
    if not survey.submission_token or rotate:
        survey.submission_token = secrets.token_urlsafe(24)
    survey.submission_enabled = True
    survey.submission_access = payload.access
    db.commit()
    db.refresh(survey)
    return _submission_status(survey)


@router.delete("/surveys/{survey_id}/submission", response_model=SubmissionStatusOut)
def disable_submission(
    survey_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    survey, _ = require_survey_role(db, survey_id, current_user.id, PROJECT_MANAGER)
    survey.submission_enabled = False
    db.commit()
    db.refresh(survey)
    return _submission_status(survey)


@router.post(
    "/surveys/{survey_id}/submission/assignees",
    response_model=SubmissionStatusOut,
    status_code=201,
)
def add_assignee(
    survey_id: uuid.UUID,
    payload: AssigneeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    survey, _ = require_survey_role(db, survey_id, current_user.id, PROJECT_MANAGER)
    email = payload.email.strip().lower()
    already = any(a.email.lower() == email for a in survey.assignees)
    if not already:
        db.add(SubmissionAssignee(survey_id=survey.id, email=email, name=payload.name))
        db.commit()
        db.refresh(survey)
    return _submission_status(survey)


@router.delete(
    "/surveys/{survey_id}/submission/assignees/{assignee_id}",
    response_model=SubmissionStatusOut,
)
def remove_assignee(
    survey_id: uuid.UUID,
    assignee_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    survey, _ = require_survey_role(db, survey_id, current_user.id, PROJECT_MANAGER)
    assignee = (
        db.query(SubmissionAssignee)
        .filter(SubmissionAssignee.id == assignee_id, SubmissionAssignee.survey_id == survey.id)
        .first()
    )
    if assignee:
        db.delete(assignee)
        db.commit()
        db.refresh(survey)
    return _submission_status(survey)


# ---------------------------------------------------------------------------
# XLSForm import — build a form the way you'd build one in Survey123 or
# KoBo Collect's XLSForm workflow, then bring it into GeoCore as a brand
# new Survey instead of rebuilding it by hand in the form builder. There's
# no asset type to attach it to any more — an imported XLSForm simply
# becomes its own Survey.
# ---------------------------------------------------------------------------


def _parsed_form_to_definition(parsed: ParsedForm) -> FormDefinition:
    sections = []
    for section in parsed.sections:
        fields = []
        for f in section.fields:
            fields.append(
                FieldDefinitionCreate(
                    label=f.label,
                    field_type=f.field_type,
                    options=f.options,
                    is_required=f.is_required,
                    visibility=f.visibility,
                    calculation=f.calculation,
                    validation=f.validation,
                    field_key=f.field_key,
                )
            )
        sections.append(
            FormSectionCreate(
                title=section.title,
                repeatable=section.repeatable,
                repeat_label=section.repeat_label,
                fields=fields,
            )
        )
    return FormDefinition(sections=sections, fields=[])


@router.post(
    "/organisations/{organisation_id}/surveys/import-xlsform",
    response_model=XLSFormImportResult,
    status_code=201,
)
async def import_xlsform(
    organisation_id: uuid.UUID,
    project_id: uuid.UUID | None = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload an .xlsx file built the way Survey123 / KoBo Collect /
    ODK's XLSForm workflow expects (a 'survey' sheet, optionally
    'choices' and 'settings') and get back a brand new Survey with its
    form already built — sections from groups, repeats from begin/end
    repeat, skip logic from `relevant`, calculated fields from
    `calculation`, validation from `constraint`, and geometry type from a
    geopoint/geotrace/geoshape question if present.

    This is a best-effort conversion, not a full XLSForm engine — see
    core/xlsform.py's module docstring. Anything it couldn't confidently
    convert comes back in `warnings` rather than being silently dropped
    or guessed at.
    """
    require_org_role(db, organisation_id, current_user.id, PROJECT_MANAGER)
    require_active_license(db, organisation_id)
    _validate_project(db, organisation_id, project_id)

    if not (file.filename or "").lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=422, detail="Upload an .xlsx (or .xls) XLSForm file.")

    content = await file.read()
    try:
        parsed = parse_xlsform(content, file.filename)
    except XLSFormError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    definition = _parsed_form_to_definition(parsed)

    survey = Survey(
        organisation_id=organisation_id,
        project_id=project_id,
        title=parsed.name,
        description=None,
        geometry_type=parsed.geometry_type,
        color="#2563eb",
        created_by=current_user.id,
    )
    db.add(survey)
    db.flush()
    _create_feature_layer_for_survey(db, survey)

    _replace_form(db, survey, definition.sections, definition.fields)
    _ensure_location_fields(db, survey)

    db.commit()
    return XLSFormImportResult(survey=_survey_with_form(db, survey.id), warnings=parsed.warnings)


# ---------------------------------------------------------------------------
# Per-survey Data Collector assignment (Portal redesign Phase 9) — optional
# scoping of which surveys a Data Collector may write to. Managed at the
# same bar as survey editing (Project Manager+), since this is a
# configuration action, not itself a data-collection one. See
# deps_project.require_survey_role / _enforce_survey_assignment_scope for
# how these rows actually change access. Distinct from the submission
# *assignees* above, which are external, unauthenticated public-link
# submitters, not GeoCore org members.
# ---------------------------------------------------------------------------


def _assignment_to_out(assignment: SurveyAssignment) -> SurveyAssignmentOut:
    return SurveyAssignmentOut(
        id=assignment.id,
        survey_id=assignment.survey_id,
        user_id=assignment.user_id,
        user_email=assignment.user.email,
        created_at=assignment.created_at,
    )


@router.get("/surveys/{survey_id}/assignments", response_model=list[SurveyAssignmentOut])
def list_survey_assignments(
    survey_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    survey, _ = require_survey_role(db, survey_id, current_user.id, PROJECT_MANAGER)
    assignments = db.query(SurveyAssignment).filter(SurveyAssignment.survey_id == survey.id).all()
    return [_assignment_to_out(a) for a in assignments]


@router.post(
    "/surveys/{survey_id}/assignments",
    response_model=SurveyAssignmentOut,
    status_code=201,
)
def create_survey_assignment(
    survey_id: uuid.UUID,
    payload: SurveyAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    survey, _ = require_survey_role(db, survey_id, current_user.id, PROJECT_MANAGER)

    if not get_membership(db, survey.organisation_id, payload.user_id):
        raise HTTPException(
            status_code=404, detail="User is not a member of this organisation"
        )

    existing = (
        db.query(SurveyAssignment)
        .filter(
            SurveyAssignment.survey_id == survey.id,
            SurveyAssignment.user_id == payload.user_id,
        )
        .first()
    )
    if existing:
        return _assignment_to_out(existing)

    assignment = SurveyAssignment(survey_id=survey.id, user_id=payload.user_id)
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return _assignment_to_out(assignment)


@router.delete("/surveys/{survey_id}/assignments/{user_id}", status_code=204)
def delete_survey_assignment(
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    survey, _ = require_survey_role(db, survey_id, current_user.id, PROJECT_MANAGER)
    assignment = (
        db.query(SurveyAssignment)
        .filter(SurveyAssignment.survey_id == survey.id, SurveyAssignment.user_id == user_id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(assignment)
    db.commit()
    return None
