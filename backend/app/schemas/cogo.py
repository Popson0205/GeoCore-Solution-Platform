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


class CogoPreviewResult(BaseModel):
    valid: bool
    reason: Optional[str] = None
    closure_error_m: Optional[float] = None
    area_sqm: Optional[float] = None
    geometry: Optional[dict] = None
    beacons: Optional[list[Optional[str]]] = None
