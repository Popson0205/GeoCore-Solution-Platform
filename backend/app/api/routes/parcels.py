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
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import require_org_role
from backend.app.core.audit import log_action
from backend.app.core.parcel_integrity import find_boundary_gap, find_overlapping_parcels, find_self_intersecting_parcels
from backend.app.core.roles import PROJECT_MANAGER, VIEWER
from backend.app.models.feature_layer import FeatureLayer
from backend.app.models.parcel_merge_source import ParcelMergeSource
from backend.app.models.record import Record
from backend.app.models.user import User
from backend.app.core.database import get_db
from backend.app.core.cogo import (
    Leg,
    points_to_geojson_polygon,
    polygon_self_intersection_error,
    reproject_to_wgs84,
    geodesic_area_sqm,
    traverse_closure_error_m,
    traverse_to_local_points,
)
from backend.app.schemas.cogo import CogoPreviewResult, CogoTraverseRequest
from backend.app.core.parcel_provisioning import get_or_create_estate_layer
from backend.app.schemas.record import RecordOut
from backend.app.schemas.parcel import (
    ParcelCreateRequest,
    ParcelGapOut,
    ParcelSelfIntersectionOut,
    ParcelIntegrityRequest,
    ParcelIntegrityResult,
    ParcelLineageOut,
    ParcelMergeRequest,
    ParcelMergeResult,
    ParcelOverlapOut,
    ParcelSplitRequest,
    ParcelSplitResult,
)

router = APIRouter()


@router.post("/organisations/{organisation_id}/parcels", response_model=RecordOut)
def create_parcel(
    organisation_id: uuid.UUID,
    payload: ParcelCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The entry point Split/Merge don't cover: a genuinely new parcel
    that doesn't come from dividing or combining an existing one — the
    normal case when first digitizing a real survey plan. No Survey
    Designer, no manually-created Feature Layer required first (see
    core/parcel_provisioning.py) -- this is COGO/drawn geometry, a
    different kind of data entry from the rest of the platform's
    form-driven Records.
    """
    require_org_role(db, organisation_id, current_user.id, PROJECT_MANAGER)
    layer = get_or_create_estate_layer(db, organisation_id, current_user.id)

    field_data = dict(payload.extra_field_data)
    if payload.plan_number:
        field_data["plan_number"] = payload.plan_number
    if payload.surveyor_name:
        field_data["surveyor_name"] = payload.surveyor_name
    if payload.surveyor_firm:
        field_data["surveyor_firm"] = payload.surveyor_firm
    if payload.owners:
        field_data["owners"] = payload.owners
    if payload.location_description:
        field_data["location_description"] = payload.location_description
    if payload.lga:
        field_data["lga"] = payload.lga
    if payload.state:
        field_data["state"] = payload.state
    if payload.scale:
        field_data["scale"] = payload.scale
    # Computed, not asked for — the real plans print this, but there's
    # no reason to make a human do the arithmetic when the boundary
    # itself already determines it (see core/cogo.py's geodesic_area_sqm).
    field_data["area_sqm"] = round(geodesic_area_sqm(payload.geometry), 2)

    record = Record(
        organisation_id=organisation_id,
        survey_id=layer.survey_id,
        feature_layer_id=layer.id,
        geometry=payload.geometry,
        field_data=field_data,
        status="active",
        land_record_id=payload.land_record_id,
        created_by=current_user.id,
    )
    db.add(record)
    db.flush()
    log_action(
        db,
        organisation_id=organisation_id,
        user_id=current_user.id,
        action="parcel.created",
        target_type="record",
        target_id=record.id,
        details={"plan_number": payload.plan_number},
    )
    db.commit()
    db.refresh(record)
    return record

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


@router.post("/feature-layers/{layer_id}/parcels/integrity-check", response_model=ParcelIntegrityResult)
def check_parcel_integrity(
    layer_id: uuid.UUID,
    payload: ParcelIntegrityRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Overlap and (optionally) gap detection for a parcel layer — see
    core/parcel_integrity.py for why this uses shapely rather than
    PostGIS SQL, and for the honest caveat about area units.
    """
    layer = db.query(FeatureLayer).filter(FeatureLayer.id == layer_id).first()
    if not layer:
        raise HTTPException(status_code=404, detail="Feature layer not found")
    require_org_role(db, layer.organisation_id, current_user.id, VIEWER)

    # Historic (retired) parcels aren't real current coverage — excluded
    # from both checks. NULL status (an ordinary, non-parcel feature
    # layer) is treated as active, so this endpoint also works as a
    # general-purpose overlap check for any polygon layer, not only
    # ones using the parcel-fabric-specific fields.
    #
    # NOTE: `Record.status != "historic"` alone would silently exclude
    # every row where status IS NULL too — SQL's three-valued logic
    # means `NULL != 'historic'` evaluates to NULL, not true, so it gets
    # filtered out of the WHERE clause. Caught this by actually running
    # the query against real seeded records (which don't set status at
    # all) rather than trusting it from reading the code.
    records = (
        db.query(Record)
        .filter(
            Record.feature_layer_id == layer_id,
            or_(Record.status != "historic", Record.status.is_(None)),
        )
        .all()
    )

    self_intersecting = find_self_intersecting_parcels(records)
    overlaps = find_overlapping_parcels(records)
    gap = find_boundary_gap(records, payload.boundary) if payload.boundary else None

    return ParcelIntegrityResult(
        parcels_checked=len(records),
        self_intersecting=[ParcelSelfIntersectionOut(**s) for s in self_intersecting],
        overlaps=[ParcelOverlapOut(**o) for o in overlaps],
        gap=ParcelGapOut(**gap) if gap else None,
    )


@router.post("/parcels/cogo-preview", response_model=CogoPreviewResult)
def preview_cogo_traverse(payload: CogoTraverseRequest, current_user: User = Depends(get_current_user)):
    """Walk a COGO (bearing/distance) traverse and validate it, WITHOUT
    saving anything — matches how a surveyor actually works: check the
    traverse closes and doesn't cross itself before it becomes a real
    parcel boundary. The resulting geometry (once valid) is a plain
    GeoJSON polygon, the same shape a hand-drawn one from LocationPicker
    already produces — so it saves through the exact same paths (a new
    record, a split's child, a merge's resulting boundary) with no
    special-casing needed anywhere else.

    No organisation/role check here deliberately — this is pure
    coordinate math with no database read or write, same as
    core/cogo.py's unit-level functions it calls. Any authenticated user
    can test a traverse; only the endpoint that actually saves the
    result (record creation, split, merge) enforces org membership/role.
    """
    legs = [Leg(l.bearing_deg, l.distance_m, l.beacon) for l in payload.legs]
    beacons = [payload.start_beacon] + [l.beacon for l in payload.legs]

    closure_error = traverse_closure_error_m(payload.start_easting, payload.start_northing, legs)
    if closure_error > payload.closure_tolerance_m:
        return CogoPreviewResult(
            valid=False,
            reason=f"Traverse does not close: {closure_error:.2f}m error (tolerance {payload.closure_tolerance_m}m)",
            closure_error_m=closure_error,
            beacons=beacons,
        )

    local_points = traverse_to_local_points(payload.start_easting, payload.start_northing, legs)
    wgs84_points = reproject_to_wgs84(local_points, payload.source_epsg)
    geometry = points_to_geojson_polygon(wgs84_points)

    self_intersection = polygon_self_intersection_error(geometry)
    if self_intersection:
        return CogoPreviewResult(
            valid=False,
            reason=f"Boundary crosses itself: {self_intersection}",
            closure_error_m=closure_error,
            geometry=geometry,
            beacons=beacons,
        )

    return CogoPreviewResult(
        valid=True,
        closure_error_m=closure_error,
        area_sqm=round(geodesic_area_sqm(geometry), 2),
        geometry=geometry,
        beacons=beacons,
    )
