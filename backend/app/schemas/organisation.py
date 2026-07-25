import uuid

from pydantic import BaseModel


class OrganisationCreate(BaseModel):
    name: str


class OrganisationOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str

    model_config = {"from_attributes": True}
