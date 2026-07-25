import uuid

from pydantic import BaseModel


class AssetTypeCount(BaseModel):
    asset_type_id: uuid.UUID
    name: str
    color: str
    record_count: int


class ProjectIndicators(BaseModel):
    project_id: uuid.UUID
    asset_type_count: int
    record_count: int
    attachment_count: int
    records_by_asset_type: list[AssetTypeCount]
