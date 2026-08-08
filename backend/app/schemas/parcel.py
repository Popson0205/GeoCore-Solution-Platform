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
    overlap_area_sq_degrees: float


class ParcelGapOut(BaseModel):
    geometry: dict
    gap_area_sq_degrees: float


class ParcelIntegrityResult(BaseModel):
    parcels_checked: int
    overlaps: list[ParcelOverlapOut]
    gap: Optional[ParcelGapOut] = None
