import uuid
from datetime import datetime

from pydantic import BaseModel


class TrashItemOut(BaseModel):
    id: uuid.UUID
    item_type: str  # "survey" | "dashboard"
    name: str
    deleted_at: datetime
    purge_at: datetime
