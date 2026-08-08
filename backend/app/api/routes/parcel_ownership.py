"""Parcel ownership history — Phase 3. See models/parcel_ownership.py's
docstring for why this is deliberately a separate concept from parcel
lineage (Phase 2): a parcel can change hands many times without its
boundary ever moving, and a split/merge doesn't by itself imply an
ownership change.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import require_org_role
from backend.app.core.audit import log_action
from backend.app.core.database import get_db
from backend.app.core.roles import PROJECT_MANAGER, VIEWER
from backend.app.models.parcel_ownership import ParcelOwnership
from backend.app.models.record import Record
from backend.app.models.user import User
from backend.app.schemas.parcel_ownership import OwnershipTransferRequest, ParcelOwnershipOut

router = APIRouter()


def _to_out(ownership: ParcelOwnership) -> ParcelOwnershipOut:
    out = ParcelOwnershipOut.model_validate(ownership)
    out.is_current = ownership.transferred_date is None
    return out


def _get_parcel_for_member(db: Session, record_id: uuid.UUID, user: User, minimum: str) -> Record:
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Parcel not found")
    require_org_role(db, record.organisation_id, user.id, minimum)
    return record


@router.get("/records/{record_id}/ownership", response_model=list[ParcelOwnershipOut])
def get_ownership_history(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_parcel_for_member(db, record_id, current_user, VIEWER)
    history = (
        db.query(ParcelOwnership)
        .filter(ParcelOwnership.record_id == record_id)
        .order_by(ParcelOwnership.acquired_date.asc().nulls_first(), ParcelOwnership.created_at.asc())
        .all()
    )
    return [_to_out(o) for o in history]


@router.post("/records/{record_id}/ownership/transfer", response_model=ParcelOwnershipOut)
def transfer_ownership(
    record_id: uuid.UUID,
    payload: OwnershipTransferRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Records a new owner and, in the same operation, closes out
    whoever the current owner was — the previous "current" row's
    transferred_date is set to this transfer's acquired_date, so there's
    never a moment where two rows for the same parcel are both
    "current", and never a manual step someone could forget.
    """
    record = _get_parcel_for_member(db, record_id, current_user, PROJECT_MANAGER)

    current = (
        db.query(ParcelOwnership)
        .filter(ParcelOwnership.record_id == record_id, ParcelOwnership.transferred_date.is_(None))
        .first()
    )
    if current:
        current.transferred_date = payload.acquired_date or date.today()

    new_ownership = ParcelOwnership(
        record_id=record.id,
        owner_name=payload.owner_name,
        owner_contact=payload.owner_contact,
        transfer_type=payload.transfer_type,
        notes=payload.notes,
        acquired_date=payload.acquired_date,
        land_record_id=payload.land_record_id,
        previous_ownership_id=current.id if current else None,
        created_by=current_user.id,
    )
    db.add(new_ownership)
    db.flush()

    log_action(
        db,
        organisation_id=record.organisation_id,
        user_id=current_user.id,
        action="parcel.ownership_transferred",
        target_type="record",
        target_id=record.id,
        details={"new_owner": payload.owner_name, "previous_owner": current.owner_name if current else None},
    )
    db.commit()
    db.refresh(new_ownership)
    return _to_out(new_ownership)
