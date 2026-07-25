import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class AssetType(Base):
    """A reusable, user-defined category of spatial data (blueprint section 11:
    Dynamic Geospatial Data Model). e.g. Drainage, School, Borehole, Road."""

    __tablename__ = "asset_types"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # point | line | polygon
    geometry_type = Column(String, default="point", nullable=False)
    color = Column(String, default="#2563eb", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", backref="asset_types")
    field_definitions = relationship(
        "FieldDefinition",
        back_populates="asset_type",
        cascade="all, delete-orphan",
        order_by="FieldDefinition.sort_order",
    )


class FieldDefinition(Base):
    """A configurable field on an asset type (blueprint section 12: Forms and
    Field Data Collection)."""

    __tablename__ = "field_definitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_type_id = Column(UUID(as_uuid=True), ForeignKey("asset_types.id"), nullable=False)
    label = Column(String, nullable=False)
    # url/json-safe key used inside a record's field_data, derived from label
    field_key = Column(String, nullable=False)
    # text | long_text | number | date | datetime | single_select | multi_select
    # | boolean | photo | video | file | signature
    field_type = Column(String, nullable=False, default="text")
    # choices for single_select / multi_select, stored as a list of strings
    options = Column(JSONB, nullable=True)
    is_required = Column(Boolean, default=False, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    asset_type = relationship("AssetType", back_populates="field_definitions")
