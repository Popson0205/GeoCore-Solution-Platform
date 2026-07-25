import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Record(Base):
    """An actual spatial data point/line/polygon collected against an asset
    type (blueprint section 10 & 11).

    `geometry` is stored as a plain GeoJSON geometry object
    (e.g. {"type": "Point", "coordinates": [lon, lat]}) in a JSONB column.
    This is the same MVP convenience the rest of the starter package uses for
    table creation: it lets records/maps ship without a PostGIS extension
    and GeoAlchemy2 dependency, and can be migrated to a real
    `geometry(Geometry, 4326)` column + spatial index later without changing
    the API shape.
    """

    __tablename__ = "records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    asset_type_id = Column(UUID(as_uuid=True), ForeignKey("asset_types.id"), nullable=False)
    geometry = Column(JSONB, nullable=False)
    # field_key -> value, keyed against that asset type's field_definitions
    field_data = Column(JSONB, default=dict, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    project = relationship("Project", backref="records")
    asset_type = relationship("AssetType", backref="records")
    attachments = relationship(
        "Attachment", back_populates="record", cascade="all, delete-orphan"
    )
