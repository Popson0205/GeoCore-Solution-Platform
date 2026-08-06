"""Pure-stdlib slug helpers — deliberately zero dependencies beyond
SQLAlchemy's Session type hint, so slugify_key can be imported from core
logic (data_import.py, dashboard_engine.py, etc.) without dragging in
the schemas layer.
"""

import re
import uuid

from sqlalchemy.orm import Session


def slugify_key(label: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return key or "field"


def slugify_org_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or uuid.uuid4().hex[:8]


def unique_org_slug(db: Session, name: str) -> str:
    """Used by every place that turns a human-entered name into a real
    Organisation.slug — registration, POST /organisations, and
    activate-license — so the exact same uniqueness rule applies no
    matter which path created the organisation.
    """
    from backend.app.models.organisation import Organisation

    base_slug = slugify_org_name(name)
    slug = base_slug
    counter = 1
    while db.query(Organisation).filter(Organisation.slug == slug).first():
        counter += 1
        slug = f"{base_slug}-{counter}"
    return slug
