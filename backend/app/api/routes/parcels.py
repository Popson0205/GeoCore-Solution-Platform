"""Parcel lineage — the actual "parcel fabric" behavior, built on top of
Phase 1's data model (Record.parent_record_id/status/land_record_id,
LandRecord, ParcelMergeSource). See models/parcel_merge_source.py and
models/land_record.py for the reasoning behind the shape of this.

Split and merge are deliberately real workflow actions here, not just
"edit the polygon and save" — the whole point of a records-driven parcel
fabric (per the research this was built from) is that a split or merge
retires the parent parcel(s) rather than overwriting them, so the
question "how did this parcel become what it is" stays answerable
instead of being silently lost the moment someone redraws a boundary.
"""

import uuid
from collections import deque

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import require_org_role
from backend.app.core.audit import log_action
from backend.app.core.roles import PROJECT_MANAGER, VIEWER
from backend.app.models.parcel_merge_source import ParcelMergeSource
from backend.app.models.record import Record
from backend.app.models.user import User
from backend.app.core.database import get_db
from backend.app.schemas.parcel import (
    ParcelLineageOut,
    ParcelMergeRequest,
    ParcelMergeResult,
    ParcelSplitRequest,
    ParcelSplitResult,
)

router = APIRouter()

MAX_LINEAGE_DEPTH = 20  # defensive cap, not expected to ever be hit by real data


def _get_active_parcel(db: Session, record_id: uuid.UUID, user: User, minimum: str) -> Record:
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Parcel not found")
    require_org_role(db, record.organisation_id, user.id, minimum)
    if record.status == "historic":
        raise HTTPException(status_code=400, detail="This parcel is already historic — it can't be split or merged again")
    return record


@router.post("/records/{record_id}/split", response_model=ParcelSplitResult)
def split_parcel(
    record_id: uuid.UUID,
    payload: ParcelSplitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    parent = _get_active_parcel(db, record_id, current_user, PROJECT_MANAGER)

    parent.status = "historic"

    children = []
    for child_input in payload.children:
        child = Record(
            organisation_id=parent.organisation_id,
            survey_id=parent.survey_id,
            feature_layer_id=parent.feature_layer_id,
            project_id=parent.project_id,
            geometry=child_input.geometry,
            field_data=child_input.field_data,
            parent_record_id=parent.id,
            status="active",
            land_record_id=payload.land_record_id,
            created_by=current_user.id,
        )
        db.add(child)
        children.append(child)

    db.flush()
    log_action(
        db,
        organisation_id=parent.organisation_id,
        user_id=current_user.id,
        action="parcel.split",
        target_type="record",
        target_id=parent.id,
        details={"child_count": len(children), "child_ids": [str(c.id) for c in children]},
    )
    db.commit()
    for c in children:
        db.refresh(c)
    db.refresh(parent)

    return ParcelSplitResult(parent=parent, children=children)


@router.post("/parcels/merge", response_model=ParcelMergeResult)
def merge_parcels(
    payload: ParcelMergeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    parents = []
    for parent_id in payload.parent_record_ids:
        parents.append(_get_active_parcel(db, parent_id, current_user, PROJECT_MANAGER))

    org_ids = {p.organisation_id for p in parents}
    if len(org_ids) > 1:
        raise HTTPException(status_code=400, detail="All source parcels must belong to the same organisation")

    layer_ids = {p.feature_layer_id for p in parents}
    if len(layer_ids) > 1:
        raise HTTPException(status_code=400, detail="All source parcels must belong to the same feature layer")

    first = parents[0]
    child = Record(
        organisation_id=first.organisation_id,
        survey_id=first.survey_id,
        feature_layer_id=first.feature_layer_id,
        project_id=first.project_id,
        geometry=payload.geometry,
        field_data=payload.field_data,
        # A merge has 2+ parents — parent_record_id (a single FK) can't
        # represent that, so it's left NULL here and the real parents are
        # recorded in ParcelMergeSource instead. See that model's
        # docstring.
        parent_record_id=None,
        status="active",
        land_record_id=payload.land_record_id,
        created_by=current_user.id,
    )
    db.add(child)
    db.flush()

    for parent in parents:
        parent.status = "historic"
        db.add(ParcelMergeSource(child_record_id=child.id, parent_record_id=parent.id))

    log_action(
        db,
        organisation_id=first.organisation_id,
        user_id=current_user.id,
        action="parcel.merge",
        target_type="record",
        target_id=child.id,
        details={"parent_ids": [str(p.id) for p in parents]},
    )
    db.commit()
    db.refresh(child)
    for p in parents:
        db.refresh(p)

    return ParcelMergeResult(parents=parents, child=child)


def _parents_of(db: Session, record: Record) -> list[Record]:
    if record.parent_record_id:
        parent = db.query(Record).filter(Record.id == record.parent_record_id).first()
        return [parent] if parent else []
    merge_source_ids = [
        row.parent_record_id
        for row in db.query(ParcelMergeSource).filter(ParcelMergeSource.child_record_id == record.id).all()
    ]
    if not merge_source_ids:
        return []
    return db.query(Record).filter(Record.id.in_(merge_source_ids)).all()


def _children_of(db: Session, record: Record) -> list[Record]:
    split_children = db.query(Record).filter(Record.parent_record_id == record.id).all()
    merge_child_ids = [
        row.child_record_id
        for row in db.query(ParcelMergeSource).filter(ParcelMergeSource.parent_record_id == record.id).all()
    ]
    merge_children = db.query(Record).filter(Record.id.in_(merge_child_ids)).all() if merge_child_ids else []
    return split_children + merge_children


@router.get("/records/{record_id}/lineage", response_model=ParcelLineageOut)
def get_parcel_lineage(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full ancestor and descendant chain for a parcel — breadth-first in
    both directions with a visited-set guard, not a raw recursive SQL CTE,
    so this behaves identically regardless of which database is behind
    it (this codebase runs against both SQLite in tests and Postgres in
    production — see the many test scripts in this conversation).
    """
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Parcel not found")
    require_org_role(db, record.organisation_id, current_user.id, VIEWER)

    ancestors: list[Record] = []
    seen = {record.id}
    queue = deque([(record, 0)])
    while queue:
        current, depth = queue.popleft()
        if depth >= MAX_LINEAGE_DEPTH:
            continue
        for parent in _parents_of(db, current):
            if parent.id not in seen:
                seen.add(parent.id)
                ancestors.append(parent)
                queue.append((parent, depth + 1))

    descendants: list[Record] = []
    seen = {record.id}
    queue = deque([(record, 0)])
    while queue:
        current, depth = queue.popleft()
        if depth >= MAX_LINEAGE_DEPTH:
            continue
        for child in _children_of(db, current):
            if child.id not in seen:
                seen.add(child.id)
                descendants.append(child)
                queue.append((child, depth + 1))

    return ParcelLineageOut(record=record, ancestors=ancestors, descendants=descendants)
