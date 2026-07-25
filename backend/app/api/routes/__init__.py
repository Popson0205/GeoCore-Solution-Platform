from fastapi import APIRouter

from backend.app.api.routes import auth, health, organisations, projects

router = APIRouter()
router.include_router(health.router, tags=["health"])
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(organisations.router, prefix="/organisations", tags=["organisations"])
router.include_router(projects.router, tags=["projects"])
