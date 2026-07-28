import secrets
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session, selectinload

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import get_project_for_member, require_project_role
from backend.app.core.database import get_db
from backend.app.core.roles import PROJECT_MANAGER
from backend.app.core.xlsform import ParsedForm, XLSFormError, parse_xlsform
from backend.app.models.asset_type import AssetType, FieldDefinition, FormSection, SubmissionAssignee
from backend.app.models.user import User
from backend.app.schemas.asset_type import (
    AssetTypeCreate,
    AssetTypeOut,
    AssetTypeUpdate,
    AssigneeCreate,
    AssigneeOut,
    FieldDefinitionCreate,
    FieldDefinitionOut,
    FormDefinition,
    FormSectionCreate,
    FormSectionOut,
    SubmissionEnableRequest,
    SubmissionStatusOut,
    XLSFormImportResult,
    slugify_key,
)

router = APIRouter()

_LOAD_OPTIONS = (
    selectinload(AssetType.sections).selectinload(FormSection.fields),
    selectinload(AssetType.field_definitions),
)


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
    asset_type_id: uuid.UUID,
    section_id: uuid.UUID | None,
    payload: FieldDefinitionCreate,
    sort_order: int,
    used_field_keys: set[str],
) -> None:
    base_key = payload.field_key if payload.field_key else slugify_key(payload.label)
    db.add(
        FieldDefinition(
            asset_type_id=asset_type_id,
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
        )
    )


def _replace_form(
    db: Session,
    asset_type: AssetType,
    sections_payload: list[FormSectionCreate],
    legacy_fields_payload: list[FieldDefinitionCreate],
) -> None:
    """Delete this asset type's existing sections/fields and recreate them
    from the given payload. Existing records keep whatever field_data they
    already have — renamed/removed fields just become inert extra keys on
    old records rather than being migrated, which is a deliberate MVP
    trade-off (see docs/CHANGES_FORM_BUILDER.md).
    """
    db.query(FormSection).filter(FormSection.asset_type_id == asset_type.id).delete()
    db.query(FieldDefinition).filter(
        FieldDefinition.asset_type_id == asset_type.id, FieldDefinition.section_id.is_(None)
    ).delete()
    db.flush()

    sections = list(sections_payload)
    if not sections and legacy_fields_payload:
        sections = [FormSectionCreate(title="General", fields=legacy_fields_payload)]

    used_section_keys: set[str] = set()
    used_field_keys: set[str] = set()

    for section_index, section_payload in enumerate(sections):
        section = FormSection(
            asset_type_id=asset_type.id,
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
            _add_field(db, asset_type.id, section.id, field_payload, field_index, used_field_keys)


def _flatten_fields(asset_type: AssetType) -> list[FieldDefinition]:
    section_order = {s.id: s.sort_order for s in asset_type.sections}

    def sort_key(field: FieldDefinition):
        return (section_order.get(field.section_id, -1), field.sort_order)

    return sorted(asset_type.field_definitions, key=sort_key)


def _to_out(asset_type: AssetType) -> AssetTypeOut:
    section_outs = [
        FormSectionOut.model_validate(s)
        for s in sorted(asset_type.sections, key=lambda s: s.sort_order)
    ]
    if not section_outs and asset_type.field_definitions:
        # Data from before the form-builder migration: no FormSection rows
        # exist yet, but flat fields do (section_id is NULL on all of
        # them). Present them as a single synthetic "General" section so
        # these older asset types still render in the sectioned UI.
        # Nothing is persisted here — saving the form once via the builder
        # makes this permanent.
        legacy_fields = sorted(asset_type.field_definitions, key=lambda f: f.sort_order)
        section_outs = [
            FormSectionOut(
                id=asset_type.id,  # stable placeholder — not a real FormSection row
                title="General",
                description=None,
                section_key="general",
                sort_order=0,
                repeatable=False,
                repeat_label=None,
                visibility=None,
                fields=[FieldDefinitionOut.model_validate(f) for f in legacy_fields],
            )
        ]
    return AssetTypeOut(
        id=asset_type.id,
        project_id=asset_type.project_id,
        name=asset_type.name,
        description=asset_type.description,
        geometry_type=asset_type.geometry_type,
        color=asset_type.color,
        sections=section_outs,
        field_definitions=[FieldDefinitionOut.model_validate(f) for f in _flatten_fields(asset_type)],
    )


@router.post("/projects/{project_id}/asset-types", response_model=AssetTypeOut, status_code=201)
def create_asset_type(
    project_id: uuid.UUID,
    payload: AssetTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Defining what a project collects is a structural change, reserved for
    # Project Manager and above (blueprint section 13).
    require_project_role(db, project_id, current_user.id, PROJECT_MANAGER)

    asset_type = AssetType(
        project_id=project_id,
        name=payload.name,
        description=payload.description,
        geometry_type=payload.geometry_type,
        color=payload.color,
    )
    db.add(asset_type)
    db.flush()

    _replace_form(db, asset_type, payload.sections, payload.fields)

    db.commit()
    asset_type = (
        db.query(AssetType).options(*_LOAD_OPTIONS).filter(AssetType.id == asset_type.id).first()
    )
    return _to_out(asset_type)


@router.get("/projects/{project_id}/asset-types", response_model=list[AssetTypeOut])
def list_asset_types(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_for_member(db, project_id, current_user.id)
    asset_types = (
        db.query(AssetType)
        .options(*_LOAD_OPTIONS)
        .filter(AssetType.project_id == project_id)
        .all()
    )
    return [_to_out(a) for a in asset_types]


def _get_asset_type_for_member(db: Session, asset_type_id: uuid.UUID, user: User) -> AssetType:
    asset_type = (
        db.query(AssetType).options(*_LOAD_OPTIONS).filter(AssetType.id == asset_type_id).first()
    )
    if not asset_type:
        raise HTTPException(status_code=404, detail="Asset type not found")
    get_project_for_member(db, asset_type.project_id, user.id)
    return asset_type


def _get_asset_type_for_role(
    db: Session, asset_type_id: uuid.UUID, user: User, minimum: str
) -> AssetType:
    asset_type = (
        db.query(AssetType).options(*_LOAD_OPTIONS).filter(AssetType.id == asset_type_id).first()
    )
    if not asset_type:
        raise HTTPException(status_code=404, detail="Asset type not found")
    require_project_role(db, asset_type.project_id, user.id, minimum)
    return asset_type


@router.get("/asset-types/{asset_type_id}", response_model=AssetTypeOut)
def get_asset_type(
    asset_type_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _to_out(_get_asset_type_for_member(db, asset_type_id, current_user))


@router.patch("/asset-types/{asset_type_id}", response_model=AssetTypeOut)
def update_asset_type(
    asset_type_id: uuid.UUID,
    payload: AssetTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cosmetic changes only — name, description, color. Use PUT
    /asset-types/{id}/form to change the form's sections/fields.
    """
    asset_type = _get_asset_type_for_role(db, asset_type_id, current_user, PROJECT_MANAGER)
    if payload.name is not None:
        asset_type.name = payload.name
    if payload.description is not None:
        asset_type.description = payload.description
    if payload.color is not None:
        asset_type.color = payload.color
    db.commit()
    db.refresh(asset_type)
    return _to_out(asset_type)


@router.put("/asset-types/{asset_type_id}/form", response_model=AssetTypeOut)
def replace_form(
    asset_type_id: uuid.UUID,
    payload: FormDefinition,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace this asset type's entire form — sections, fields, skip
    logic, calculations and validation rules — in one shot, the way a form
    builder's "Save form" action works. Existing records aren't migrated
    (see _replace_form's docstring).
    """
    asset_type = _get_asset_type_for_role(db, asset_type_id, current_user, PROJECT_MANAGER)
    _replace_form(db, asset_type, payload.sections, payload.fields)
    db.commit()
    asset_type = (
        db.query(AssetType).options(*_LOAD_OPTIONS).filter(AssetType.id == asset_type_id).first()
    )
    return _to_out(asset_type)


@router.delete("/asset-types/{asset_type_id}", status_code=204)
def delete_asset_type(
    asset_type_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset_type = _get_asset_type_for_role(db, asset_type_id, current_user, PROJECT_MANAGER)
    db.delete(asset_type)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Submission links — "field officer only needs the link" (blueprint §7)
# ---------------------------------------------------------------------------


def _submission_status(asset_type: AssetType) -> SubmissionStatusOut:
    return SubmissionStatusOut(
        enabled=asset_type.submission_enabled,
        access=asset_type.submission_access,
        token=asset_type.submission_token if asset_type.submission_enabled else None,
        public_path=f"/submit/{asset_type.submission_token}"
        if (asset_type.submission_enabled and asset_type.submission_token)
        else None,
        assignees=[AssigneeOut.model_validate(a) for a in asset_type.assignees],
    )


@router.get("/asset-types/{asset_type_id}/submission", response_model=SubmissionStatusOut)
def get_submission_status(
    asset_type_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset_type = _get_asset_type_for_role(db, asset_type_id, current_user, PROJECT_MANAGER)
    return _submission_status(asset_type)


@router.post("/asset-types/{asset_type_id}/submission", response_model=SubmissionStatusOut)
def enable_submission(
    asset_type_id: uuid.UUID,
    payload: SubmissionEnableRequest,
    rotate: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Turn on this asset type's submission link. `access="public"` means
    anyone with the link can submit with no login; `access="assigned"`
    restricts submissions to emails added via the assignees endpoints
    below. Either way, submissions still go through the exact same
    validation/calculation engine as an internal record (see
    routes/public.py -> core/form_engine.py) — the link only changes *who*
    can submit, never what's accepted.
    """
    asset_type = _get_asset_type_for_role(db, asset_type_id, current_user, PROJECT_MANAGER)
    if not asset_type.submission_token or rotate:
        asset_type.submission_token = secrets.token_urlsafe(24)
    asset_type.submission_enabled = True
    asset_type.submission_access = payload.access
    db.commit()
    db.refresh(asset_type)
    return _submission_status(asset_type)


@router.delete("/asset-types/{asset_type_id}/submission", response_model=SubmissionStatusOut)
def disable_submission(
    asset_type_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset_type = _get_asset_type_for_role(db, asset_type_id, current_user, PROJECT_MANAGER)
    asset_type.submission_enabled = False
    db.commit()
    db.refresh(asset_type)
    return _submission_status(asset_type)


@router.post(
    "/asset-types/{asset_type_id}/submission/assignees",
    response_model=SubmissionStatusOut,
    status_code=201,
)
def add_assignee(
    asset_type_id: uuid.UUID,
    payload: AssigneeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset_type = _get_asset_type_for_role(db, asset_type_id, current_user, PROJECT_MANAGER)
    email = payload.email.strip().lower()
    already = any(a.email.lower() == email for a in asset_type.assignees)
    if not already:
        db.add(SubmissionAssignee(asset_type_id=asset_type.id, email=email, name=payload.name))
        db.commit()
        db.refresh(asset_type)
    return _submission_status(asset_type)


@router.delete(
    "/asset-types/{asset_type_id}/submission/assignees/{assignee_id}",
    response_model=SubmissionStatusOut,
)
def remove_assignee(
    asset_type_id: uuid.UUID,
    assignee_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset_type = _get_asset_type_for_role(db, asset_type_id, current_user, PROJECT_MANAGER)
    assignee = (
        db.query(SubmissionAssignee)
        .filter(
            SubmissionAssignee.id == assignee_id, SubmissionAssignee.asset_type_id == asset_type.id
        )
        .first()
    )
    if assignee:
        db.delete(assignee)
        db.commit()
        db.refresh(asset_type)
    return _submission_status(asset_type)


# ---------------------------------------------------------------------------
# XLSForm import — build a form the way you'd build one in Survey123 or
# KoBo Collect's XLSForm workflow, then bring it into GeoCore instead of
# rebuilding it by hand in the form builder.
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
    "/projects/{project_id}/asset-types/import-xlsform",
    response_model=XLSFormImportResult,
    status_code=201,
)
async def import_xlsform(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload an .xlsx file built the way Survey123 / KoBo Collect /
    ODK's XLSForm workflow expects (a 'survey' sheet, optionally
    'choices' and 'settings') and get back a new asset type with its form
    already built — sections from groups, repeats from begin/end repeat,
    skip logic from `relevant`, calculated fields from `calculation`,
    validation from `constraint`, and geometry type from a
    geopoint/geotrace/geoshape question if present.

    This is a best-effort conversion, not a full XLSForm engine — see
    core/xlsform.py's module docstring. Anything it couldn't confidently
    convert comes back in `warnings` rather than being silently dropped
    or guessed at.
    """
    require_project_role(db, project_id, current_user.id, PROJECT_MANAGER)

    if not (file.filename or "").lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=422, detail="Upload an .xlsx (or .xls) XLSForm file.")

    content = await file.read()
    try:
        parsed = parse_xlsform(content, file.filename)
    except XLSFormError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    definition = _parsed_form_to_definition(parsed)

    asset_type = AssetType(
        project_id=project_id,
        name=parsed.name,
        description=None,
        geometry_type=parsed.geometry_type,
        color="#2563eb",
    )
    db.add(asset_type)
    db.flush()

    _replace_form(db, asset_type, definition.sections, definition.fields)

    db.commit()
    asset_type = (
        db.query(AssetType).options(*_LOAD_OPTIONS).filter(AssetType.id == asset_type.id).first()
    )
    return XLSFormImportResult(asset_type=_to_out(asset_type), warnings=parsed.warnings)
