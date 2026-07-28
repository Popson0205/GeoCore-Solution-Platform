import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AttachmentOut(BaseModel):
    id: uuid.UUID
    record_id: uuid.UUID
    file_name: str
    content_type: Optional[str] = None
    size_bytes: int
    url: str
    created_at: datetime

    model_config = {"from_attributes": True}
