from fastapi import APIRouter

from backend.app.api.routes import (
    attachments,
    auth,
    dashboard,
    dashboards,
    health,
    organisations,
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
router.include_router(records.router, tags=["records"])
router.include_router(attachments.router, tags=["attachments"])
router.include_router(dashboard.router, tags=["dashboard"])
router.include_router(dashboards.router, tags=["dashboards"])
router.include_router(reports.router, tags=["reports"])
# No get_current_user dependency on this router — access is controlled by
# the share_token/share_enabled check inside each handler instead.
router.include_router(public.router, prefix="/public", tags=["public"])
