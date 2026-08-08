import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class EstateGridCalibration(Base):
    """A saved, reusable correction for one local grid (EPSG code) within
    one organisation -- captured once against a known real-world GPS
    position (a control station, or any beacon someone has independently
    verified), then applied automatically to every future COGO plot on
    that same grid, instead of asking for a fresh GPS reading on every
    single property.

    This exists because Minna datum's transformation to WGS84 is
    documented as regionally inconsistent, and real Nigerian survey
    plans from the same firm/area consistently reference the same
    shared control station -- see core/cogo.py's
    calibrated_reproject_to_wgs84's reference_point parameter, which is
    what makes reusing a calibration captured against one point (the
    control station) for a DIFFERENT property's traverse possible.

    One calibration per (organisation, source_epsg) -- if a second one
    is saved for the same EPSG, it replaces the first (see
    routes/parcels.py's upsert endpoint) rather than accumulating
    silently-conflicting corrections for the same grid.
    """

    __tablename__ = "estate_grid_calibrations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False, index=True)
    source_epsg = Column(Integer, nullable=False)

    reference_easting = Column(Float, nullable=False)
    reference_northing = Column(Float, nullable=False)
    known_lat = Column(Float, nullable=False)
    known_lon = Column(Float, nullable=False)
    label = Column(String, nullable=True)  # e.g. "OS-APPSN 01S"

    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    organisation = relationship("Organisation")
