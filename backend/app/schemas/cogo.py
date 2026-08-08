from typing import Optional

from pydantic import BaseModel, Field


class CogoLeg(BaseModel):
    bearing_deg: float = Field(..., description="0 = Grid North, clockwise")
    distance_m: float = Field(..., gt=0)
    beacon: Optional[str] = Field(None, description="Beacon/pillar number marking the point this leg walks TO")


class CogoPointPreviewRequest(BaseModel):
    easting: float
    northing: float
    source_epsg: int
    # If the caller knows this exact point's real-world GPS position (a
    # phone/handheld GPS reading taken standing at this beacon, or a
    # reference station's independently published coordinate), this
    # locally corrects for Minna datum's regionally inconsistent
    # transformation to WGS84 -- a documented, known limitation, not
    # something specific to this codebase. See core/cogo.py's
    # calibrated_reproject_to_wgs84.
    known_lat: Optional[float] = None
    known_lon: Optional[float] = None


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


class CogoPreviewResult(BaseModel):
    valid: bool
    reason: Optional[str] = None
    closure_error_m: Optional[float] = None
    area_sqm: Optional[float] = None
    geometry: Optional[dict] = None
    beacons: Optional[list[Optional[str]]] = None
