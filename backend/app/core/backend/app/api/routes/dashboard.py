import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import get_project_for_member
from backend.app.core.database import get_db
from backend.app.models.asset_type import AssetType
from backend.app.models.attachment import Attachment
from backend.app.models.record import Record
from backend.app.models.user import User
from backend.app.schemas.dashboard import AssetTypeCount, ProjectIndicators

router = APIRouter()


@router.get("/projects/{project_id}/dashboard", response_model=ProjectIndicators)
def project_indicators(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_for_member(db, project_id, current_user.id)

    asset_types = db.query(AssetType).filter(AssetType.project_id == project_id).all()

    counts_by_type = dict(
        db.query(Record.asset_type_id, func.count(Record.id))
        .filter(Record.project_id == project_id)
        .group_by(Record.asset_type_id)
        .all()
    )

    record_count = sum(counts_by_type.values())

    attachment_count = (
        db.query(func.count(Attachment.id))
        .join(Record, Record.id == Attachment.record_id)
        .filter(Record.project_id == project_id)
        .scalar()
        or 0
    )

    return ProjectIndicators(
        project_id=project_id,
        asset_type_count=len(asset_types),
        record_count=record_count,
        attachment_count=attachment_count,
        records_by_asset_type=[
            AssetTypeCount(
                asset_type_id=asset_type.id,
                name=asset_type.name,
                color=asset_type.color,
                record_count=counts_by_type.get(asset_type.id, 0),
            )
            for asset_type in asset_types
        ],
    )
