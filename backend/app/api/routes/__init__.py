from fastapi import APIRouter

from backend.app.api.routes import (
    attachments,
    auth,
    dashboard,
    dashboards,
    feature_layers,
    health,
    land_records,
    organisations,
    parcels,
    projects,
    public,
    records,
    reports,
    surveys,
)

router = APIRouter()
router.include_router(health.router, tags=["health"])
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(organisations.router, prefix="/organisations", tags=["organisations"])
router.include_router(projects.router, tags=["projects"])
# A Survey now owns its own form directly (flat Survey123/KoBo model) — the
# old asset-types router is gone; form-builder, submission-link, and
# XLSForm-import endpoints all live in surveys.router now.
router.include_router(surveys.router, tags=["surveys"])
router.include_router(feature_layers.router, tags=["feature-layers"])
router.include_router(records.router, tags=["records"])
router.include_router(attachments.router, tags=["attachments"])
router.include_router(dashboard.router, tags=["dashboard"])
router.include_router(dashboards.router, tags=["dashboards"])
router.include_router(reports.router, tags=["reports"])
router.include_router(land_records.router, tags=["land-records"])
router.include_router(parcels.router, tags=["parcels"])
# The Admin Portal is a genuinely separate deployment AND a genuinely
# separate repository now (github.com/Popson0205/GeoCore-Admin-Portal)
# -- this backend process registers nothing under /admin at all, and
# doesn't even contain that code, so there's no route here to
# accidentally expose even if a role check were ever missed.
# No get_current_user dependency on this router — access is controlled by
# the share_token/share_enabled check inside each handler instead.
router.include_router(public.router, prefix="/public", tags=["public"])
