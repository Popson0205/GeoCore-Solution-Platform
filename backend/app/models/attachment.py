import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Attachment(Base):
    """A photo or document attached to a spatial record (blueprint section
    14: Attachments). Files are written to local disk storage for this MVP —
    see `backend/app/core/storage.py`. Swap for S3-compatible storage before
    production use, per the blueprint's recommended stack.
    """

    __tablename__ = "attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    record_id = Column(UUID(as_uuid=True), ForeignKey("records.id"), nullable=False)
    file_name = Column(String, nullable=False)
    content_type = Column(String, nullable=True)
    size_bytes = Column(BigInteger, default=0, nullable=False)
    # relative path under the storage root, used to build a download URL
    storage_path = Column(String, nullable=False)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    record = relationship("Record", back_populates="attachments")
