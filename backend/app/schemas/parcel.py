import uuid
from typing import Optional

from pydantic import BaseModel, field_validator

from backend.app.schemas.record import RecordOut


class ParcelChildInput(BaseModel):
    geometry: dict
    field_data: dict = {}


class ParcelSplitRequest(BaseModel):
    children: list[ParcelChildInput]
    # The deed/plat/subdivision plan that authorizes this split — every
    # resulting child (and the now-historic parent) traces back to it.
    # Optional because not every organisation using GeoCore Estate will
    # have digitized their records yet; a split without one still works,
    # it's just a parcel edit without a documented paper trail behind it.
    land_record_id: Optional[uuid.UUID] = None

    @field_validator("children")
    @classmethod
    def validate_children(cls, value: list[ParcelChildInput]) -> list[ParcelChildInput]:
        if len(value) < 2:
            raise ValueError("A split needs at least 2 resulting parcels")
        return value


class ParcelMergeRequest(BaseModel):
    parent_record_ids: list[uuid.UUID]
    geometry: dict
    field_data: dict = {}
    land_record_id: Optional[uuid.UUID] = None

    @field_validator("parent_record_ids")
    @classmethod
    def validate_parents(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(value) < 2:
            raise ValueError("A merge needs at least 2 source parcels")
        if len(set(value)) != len(value):
            raise ValueError("Duplicate parcel in parent_record_ids")
        return value


class ParcelSplitResult(BaseModel):
    parent: RecordOut
    children: list[RecordOut]


class ParcelMergeResult(BaseModel):
    parents: list[RecordOut]
    child: RecordOut


class ParcelCreateRequest(BaseModel):
    """Fields modeled directly on a real Nigerian cadastral survey plan
    (see the two reference plans this was built from) rather than
    invented generically — plan_number matches the "PLAN NO" box,
    owners supports the plan's actual joint-ownership case (a husband
    and wife on the same title), location/lga/state matches the plan's
    three-level location description, and scale matches its printed
    map scale. Stored in the parcel Record's field_data under these
    exact keys (see routes/parcels.py's create_parcel) rather than as
    new dedicated columns -- consistent with the rest of the platform's
    "one generic Record model, configured per use" approach.
    """

    geometry: dict
    plan_number: Optional[str] = None
    surveyor_name: Optional[str] = None
    surveyor_firm: Optional[str] = None
    owners: list[str] = []
    location_description: Optional[str] = None
    lga: Optional[str] = None
    state: Optional[str] = None
    scale: Optional[str] = None
    land_record_id: Optional[uuid.UUID] = None
    extra_field_data: dict = {}


class ParcelLineageOut(BaseModel):
    record: RecordOut
    ancestors: list[RecordOut]
    descendants: list[RecordOut]


class ParcelIntegrityRequest(BaseModel):
    # Optional reference boundary (e.g. a subdivision's outer edge) to
    # check full coverage against — without it, only overlap detection
    # runs, since gap detection needs something to compare against.
    boundary: Optional[dict] = None


class ParcelOverlapOut(BaseModel):
    record_id_a: uuid.UUID
    record_id_b: uuid.UUID
    overlap_area_sqm: float


class ParcelGapOut(BaseModel):
    geometry: dict
    gap_area_sqm: float


class ParcelSelfIntersectionOut(BaseModel):
    record_id: uuid.UUID
    reason: str


class ParcelIntegrityResult(BaseModel):
    parcels_checked: int
    self_intersecting: list[ParcelSelfIntersectionOut] = []
    overlaps: list[ParcelOverlapOut]
    gap: Optional[ParcelGapOut] = None
