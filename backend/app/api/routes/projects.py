import secrets
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import require_active_license, require_org_role, require_project_role
from backend.app.core.database import get_db
from backend.app.core.roles import ADMINISTRATOR, PROJECT_MANAGER, VIEWER
from backend.app.models.project import Project
from backend.app.models.user import User
from backend.app.schemas.project import (
    ProjectCreate,
    ProjectOut,
    ProjectShareOut,
    ProjectUpdate,
)

router = APIRouter()


@router.post(
    "/organisations/{organisation_id}/projects", response_model=ProjectOut, status_code=201
)
def create_project(
    organisation_id: uuid.UUID,
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Data Collector / Analyst / Viewer shouldn't be able to spin up new
    # projects — that's a Project Manager+ action (blueprint section 13).
    require_org_role(db, organisation_id, current_user.id, PROJECT_MANAGER)
    require_active_license(db, organisation_id)
    project = Project(
        organisation_id=organisation_id, name=payload.name, description=payload.description
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get(
    "/organisations/{organisation_id}/projects", response_model=list[ProjectOut]
)
def list_projects(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_org_role(db, organisation_id, current_user.id, VIEWER)
    return db.query(Project).filter(Project.organisation_id == organisation_id).all()


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project, _ = require_project_role(db, project_id, current_user.id, PROJECT_MANAGER)
    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Deleting a project removes every record, asset type, attachment and
    # report under it — reserved for administrator+ (blueprint section 13).
    project, _ = require_project_role(db, project_id, current_user.id, ADMINISTRATOR)
    db.delete(project)
    db.commit()
    return None


@router.get("/projects/{project_id}/share", response_model=ProjectShareOut)
def get_share_status(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project, _ = require_project_role(db, project_id, current_user.id, PROJECT_MANAGER)
    return ProjectShareOut(
        share_enabled=project.share_enabled,
        share_token=project.share_token if project.share_enabled else None,
        public_path=f"/share/{project.share_token}"
        if (project.share_enabled and project.share_token)
        else None,
    )


@router.post("/projects/{project_id}/share", response_model=ProjectShareOut)
def enable_share(
    project_id: uuid.UUID,
    rotate: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enable (and optionally rotate) this project's public read-only link.
    Anyone with the link can view the map, records, and reports without
    logging in — see routes/public.py. This is the "explicit, secure
    sharing mechanism" blueprint section 7 requires before data ever
    crosses the organisation boundary.
    """
    project, _ = require_project_role(db, project_id, current_user.id, PROJECT_MANAGER)
    if not project.share_token or rotate:
        project.share_token = secrets.token_urlsafe(24)
    project.share_enabled = True
    db.commit()
    db.refresh(project)
    return ProjectShareOut(
        share_enabled=True,
        share_token=project.share_token,
        public_path=f"/share/{project.share_token}",
    )


@router.delete("/projects/{project_id}/share", response_model=ProjectShareOut)
def disable_share(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project, _ = require_project_role(db, project_id, current_user.id, PROJECT_MANAGER)
    project.share_enabled = False
    db.commit()
    db.refresh(project)
    return ProjectShareOut(share_enabled=False, share_token=None, public_path=None)
