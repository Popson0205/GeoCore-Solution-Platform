import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: uuid.UUID
    action: str
    target_type: Optional[str] = None
    target_id: Optional[uuid.UUID] = None
    details: Optional[dict] = None
    ip_address: Optional[str] = None
    created_at: datetime
    # Resolved at read time (not a mapped column) — see
    # routes/organisations.py's list_audit_log.
    user_email: Optional[str] = None

    model_config = {"from_attributes": True}
