"""Unauthenticated GeoCore Estate parcel search — the public-facing half
of the parcel fabric work: someone who isn't a GeoCore user at all
(a prospective buyer, a bank doing due diligence, the property owner
themselves) can look up a specific property and see its accurate
plotted boundary and details.

Deliberately off by default (Organisation.estate_public_search_enabled)
-- land ownership data is sensitive, and an org has to explicitly opt
in before any of its parcels are reachable here. Historic (retired)
parcels are excluded from both endpoints on purpose: what's publicly
useful is "what does this property look like today", not its full
edit history, which stays inside the authenticated app
(GET /records/{id}/lineage).
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.core.parcel_provisioning import ESTATE_SURVEY_TITLE
from backend.app.models.feature_layer import FeatureLayer
from backend.app.models.organisation import Organisation
from backend.app.models.record import Record
from backend.app.models.survey import Survey
from backend.app.schemas.parcel import PublicParcelOut, PublicSearchResultOut

router = APIRouter()


def _get_enabled_org(db: Session, org_slug: str) -> Organisation:
    org = db.query(Organisation).filter(Organisation.slug == org_slug).first()
    # Same response either way (a generic 404) whether the org doesn't
    # exist or just hasn't opted in -- doesn't reveal which, matching
    # routes/public.py's existing share_token pattern for the same reason.
    if not org or not org.estate_public_search_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    return org


def _estate_layer_id(db: Session, organisation_id: uuid.UUID) -> uuid.UUID | None:
    layer = (
        db.query(FeatureLayer)
        .join(Survey, FeatureLayer.survey_id == Survey.id)
        .filter(FeatureLayer.organisation_id == organisation_id, Survey.title == ESTATE_SURVEY_TITLE)
        .first()
    )
    return layer.id if layer else None


def _to_search_result(record: Record) -> PublicSearchResultOut:
    fd = record.field_data or {}
    return PublicSearchResultOut(
        id=record.id,
        plan_number=fd.get("plan_number"),
        owners=fd.get("owners") or [],
        location_description=fd.get("location_description"),
        lga=fd.get("lga"),
        state=fd.get("state"),
        area_sqm=fd.get("area_sqm"),
    )


@router.get("/public/estate/{org_slug}/search", response_model=list[PublicSearchResultOut])
def search_public_parcels(
    org_slug: str,
    q: str = "",
    db: Session = Depends(get_db),
):
    org = _get_enabled_org(db, org_slug)
    layer_id = _estate_layer_id(db, org.id)
    if not layer_id:
        return []

    query = db.query(Record).filter(
        Record.feature_layer_id == layer_id,
        or_(Record.status != "historic", Record.status.is_(None)),
    )

    q = q.strip()
    if q:
        # JSONB text search across the two fields someone would actually
        # search by (a plan number, or their own name) -- Postgres can
        # index this later (a GIN index on field_data) if search volume
        # ever makes the plain filter too slow; not needed at this scale.
        like = f"%{q}%"
        query = query.filter(
            or_(
                Record.field_data["plan_number"].astext.ilike(like),
                Record.field_data["owners"].astext.ilike(like),
            )
        )

    results = query.order_by(Record.updated_at.desc()).limit(50).all()
    return [_to_search_result(r) for r in results]


@router.get("/public/estate/{org_slug}/parcels/{record_id}", response_model=PublicParcelOut)
def get_public_parcel(
    org_slug: str,
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    org = _get_enabled_org(db, org_slug)
    record = db.query(Record).filter(Record.id == record_id, Record.organisation_id == org.id).first()
    if not record or record.status == "historic":
        raise HTTPException(status_code=404, detail="Not found")
    return PublicParcelOut(id=record.id, geometry=record.geometry, field_data=record.field_data, updated_at=record.updated_at)
