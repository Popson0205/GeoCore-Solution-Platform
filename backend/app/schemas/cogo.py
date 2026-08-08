import uuid
from typing import Optional

from pydantic import BaseModel, Field


class CogoLeg(BaseModel):
    bearing_deg: float = Field(..., description="0 = Grid North, clockwise")
    distance_m: float = Field(..., gt=0)
    beacon: Optional[str] = Field(None, description="Beacon/pillar number marking the point this leg walks TO")


class EstateCalibrationUpsert(BaseModel):
    source_epsg: int
    reference_easting: float
    reference_northing: float
    known_lat: float
    known_lon: float
    label: Optional[str] = None


class EstateCalibrationOut(BaseModel):
    source_epsg: int
    reference_easting: float
    reference_northing: float
    known_lat: float
    known_lon: float
    label: Optional[str] = None

    model_config = {"from_attributes": True}


class CogoCloseLegRequest(BaseModel):
    start_easting: float
    start_northing: float
    legs: list[CogoLeg]


class CogoCloseLegResult(BaseModel):
    bearing_deg: float
    distance_m: float


class CogoPointPreviewRequest(BaseModel):
    easting: float
    northing: float
    source_epsg: int
    # Explicit calibration for THIS point, if the caller has a fresh GPS
    # reading for it specifically -- takes priority over any saved
    # organisation-wide calibration below.
    known_lat: Optional[float] = None
    known_lon: Optional[float] = None
    # If no explicit known_lat/known_lon above, and this is set, the
    # endpoint looks up a previously saved calibration for this
    # organisation + source_epsg (see EstateGridCalibration) and applies
    # it automatically -- the whole point of saving one once instead of
    # asking for a fresh GPS reading on every single property.
    organisation_id: Optional[uuid.UUID] = None


class CogoPointPreviewResult(BaseModel):
    lon: float
    lat: float


class CogoTraverseRequest(BaseModel):
    start_easting: float = Field(..., description="Easting (m) on the local grid, not longitude")
    start_northing: float = Field(..., description="Northing (m) on the local grid, not latitude")
    source_epsg: int = Field(..., description="EPSG code of the local grid, e.g. 26392 (Minna / Nigeria Mid Belt) or a UTM zone")
    start_beacon: Optional[str] = None
    legs: list[CogoLeg]
    closure_tolerance_m: float = 0.5
    known_lat: Optional[float] = None
    known_lon: Optional[float] = None
    organisation_id: Optional[uuid.UUID] = None


class CogoPreviewResult(BaseModel):
    valid: bool
    reason: Optional[str] = None
    closure_error_m: Optional[float] = None
    area_sqm: Optional[float] = None
    geometry: Optional[dict] = None
    beacons: Optional[list[Optional[str]]] = None
