import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import get_project_for_member
from backend.app.core.database import get_db
from backend.app.models.asset_type import AssetType, FieldDefinition
from backend.app.models.user import User
from backend.app.schemas.asset_type import AssetTypeCreate, AssetTypeOut, slugify_key

router = APIRouter()


@router.post("/projects/{project_id}/asset-types", response_model=AssetTypeOut, status_code=201)
def create_asset_type(
    project_id: uuid.UUID,
    payload: AssetTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_for_member(db, project_id, current_user.id)

    asset_type = AssetType(
        project_id=project_id,
        name=payload.name,
        description=payload.description,
        geometry_type=payload.geometry_type,
        color=payload.color,
    )
    db.add(asset_type)
    db.flush()

    used_keys: set[str] = set()
    for index, field in enumerate(payload.fields):
        base_key = slugify_key(field.label)
        key = base_key
        suffix = 1
        while key in used_keys:
            suffix += 1
            key = f"{base_key}_{suffix}"
        used_keys.add(key)

        db.add(
            FieldDefinition(
                asset_type_id=asset_type.id,
                label=field.label,
                field_key=key,
                field_type=field.field_type,
                options=field.options,
                is_required=field.is_required,
                sort_order=field.sort_order or index,
            )
        )

    db.commit()
    db.refresh(asset_type)
    return asset_type


@router.get("/projects/{project_id}/asset-types", response_model=list[AssetTypeOut])
def list_asset_types(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_for_member(db, project_id, current_user.id)
    return (
        db.query(AssetType)
        .options(selectinload(AssetType.field_definitions))
        .filter(AssetType.project_id == project_id)
        .all()
    )


def _get_asset_type_for_member(
    db: Session, asset_type_id: uuid.UUID, user: User
) -> AssetType:
    asset_type = (
        db.query(AssetType)
        .options(selectinload(AssetType.field_definitions))
        .filter(AssetType.id == asset_type_id)
        .first()
    )
    if not asset_type:
        raise HTTPException(status_code=404, detail="Asset type not found")
    get_project_for_member(db, asset_type.project_id, user.id)
    return asset_type


@router.get("/asset-types/{asset_type_id}", response_model=AssetTypeOut)
def get_asset_type(
    asset_type_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_asset_type_for_member(db, asset_type_id, current_user)


@router.delete("/asset-types/{asset_type_id}", status_code=204)
def delete_asset_type(
    asset_type_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset_type = _get_asset_type_for_member(db, asset_type_id, current_user)
    db.delete(asset_type)
    db.commit()
    return None
