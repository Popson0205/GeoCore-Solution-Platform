import uuid
from typing import Optional

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    share_enabled: bool = False

    model_config = {"from_attributes": True}


class ProjectShareOut(BaseModel):
    """Only returned to callers with project_manager role or above (see
    routes/projects.py) — the token itself is the access credential for the
    public, unauthenticated read-only view.
    """

    share_enabled: bool
    share_token: Optional[str] = None
    public_path: Optional[str] = None
