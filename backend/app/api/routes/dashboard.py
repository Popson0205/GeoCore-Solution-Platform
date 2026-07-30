import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import get_organisation_for_member, get_project_for_member
from backend.app.core.database import get_db
from backend.app.models.asset_type import AssetType
from backend.app.models.attachment import Attachment
from backend.app.models.record import Record
from backend.app.models.survey import Survey
from backend.app.models.user import User
from backend.app.schemas.dashboard import AssetTypeCount, OrganisationIndicators, ProjectIndicators

router = APIRouter()


@router.get("/organisations/{organisation_id}/dashboard", response_model=OrganisationIndicators)
def organisation_indicators(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The Portal-wide analogue of the project indicators panel below
    (Portal redesign Phase 2, this Phase 6) — every asset type/record/
    attachment across every survey in the organisation, not walled inside
    one project.
    """
    get_organisation_for_member(db, organisation_id, current_user.id)

    asset_types = (
        db.query(AssetType)
        .join(Survey, Survey.id == AssetType.survey_id)
        .filter(Survey.organisation_id == organisation_id)
        .all()
    )

    counts_by_type = dict(
        db.query(Record.asset_type_id, func.count(Record.id))
        .filter(Record.organisation_id == organisation_id)
        .group_by(Record.asset_type_id)
        .all()
    )

    record_count = sum(counts_by_type.values())

    attachment_count = (
        db.query(func.count(Attachment.id))
        .join(Record, Record.id == Attachment.record_id)
        .filter(Record.organisation_id == organisation_id)
        .scalar()
        or 0
    )

    return OrganisationIndicators(
        organisation_id=organisation_id,
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


@router.get("/projects/{project_id}/dashboard", response_model=ProjectIndicators)
def project_indicators(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kept working (not deprecated — Project remains a valid optional
    folder scope, per the 10-phase plan's Phase 10 note that Project can
    stay as a permanent optional concept). Fixed to resolve asset types
    through Survey.project_id, since AssetType no longer carries its own
    project_id directly (Portal redesign Phase 1), and to count records by
    asset type rather than by Record.project_id, since that column is now
    only an optional folder tag and isn't reliably set on every record
    filed under this project's surveys.
    """
    get_project_for_member(db, project_id, current_user.id)

    asset_types = (
        db.query(AssetType)
        .join(Survey, Survey.id == AssetType.survey_id)
        .filter(Survey.project_id == project_id)
        .all()
    )
    asset_type_ids = [a.id for a in asset_types]

    counts_by_type = {}
    attachment_count = 0
    if asset_type_ids:
        counts_by_type = dict(
            db.query(Record.asset_type_id, func.count(Record.id))
            .filter(Record.asset_type_id.in_(asset_type_ids))
            .group_by(Record.asset_type_id)
            .all()
        )
        attachment_count = (
            db.query(func.count(Attachment.id))
            .join(Record, Record.id == Attachment.record_id)
            .filter(Record.asset_type_id.in_(asset_type_ids))
            .scalar()
            or 0
        )

    record_count = sum(counts_by_type.values())

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
