from pydantic import BaseModel

class HealthResponse(BaseModel):
    status: str
    app_name: str
    version: str

class PlatformOverview(BaseModel):
    name: str
    purpose: str
    next_steps: list[str]
