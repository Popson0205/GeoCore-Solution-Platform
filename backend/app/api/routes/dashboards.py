import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import get_project_for_member, require_project_role
from backend.app.core.dashboard_engine import compute_widget
from backend.app.core.database import get_db
from backend.app.core.roles import ANALYST
from backend.app.models.dashboard import Dashboard, DashboardWidget
from backend.app.models.record import Record
from backend.app.models.user import User
from backend.app.schemas.dashboards import (
    DashboardCreate,
    DashboardOut,
    DashboardSummaryOut,
    DashboardUpdate,
    WidgetCreate,
    WidgetOut,
    WidgetUpdate,
)

router = APIRouter()


def _get_dashboard(db: Session, dashboard_id: uuid.UUID) -> Dashboard:
    dashboard = (
        db.query(Dashboard)
        .options(selectinload(Dashboard.widgets))
        .filter(Dashboard.id == dashboard_id)
        .first()
    )
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


def _get_dashboard_for_member(db: Session, dashboard_id: uuid.UUID, user: User) -> Dashboard:
    dashboard = _get_dashboard(db, dashboard_id)
    get_project_for_member(db, dashboard.project_id, user.id)
    return dashboard


def _get_dashboard_for_role(
    db: Session, dashboard_id: uuid.UUID, user: User, minimum: str
) -> Dashboard:
    dashboard = _get_dashboard(db, dashboard_id)
    require_project_role(db, dashboard.project_id, user.id, minimum)
    return dashboard


@router.post("/projects/{project_id}/dashboards", response_model=DashboardOut, status_code=201)
def create_dashboard(
    project_id: uuid.UUID,
    payload: DashboardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Building a dashboard is an analysis task, not a data-structure change
    # — Analyst and above (blueprint section 13's "Analyst: view, filter,
    # analyse and export data").
    require_project_role(db, project_id, current_user.id, ANALYST)
    dashboard = Dashboard(project_id=project_id, name=payload.name, description=payload.description)
    db.add(dashboard)
    db.commit()
    db.refresh(dashboard)
    return dashboard


@router.get("/projects/{project_id}/dashboards", response_model=list[DashboardSummaryOut])
def list_dashboards(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_for_member(db, project_id, current_user.id)
    dashboards = (
        db.query(Dashboard)
        .options(selectinload(Dashboard.widgets))
        .filter(Dashboard.project_id == project_id)
        .order_by(Dashboard.created_at)
        .all()
    )
    return [
        DashboardSummaryOut(
            id=d.id,
            name=d.name,
            description=d.description,
            updated_at=d.updated_at,
            widget_count=len(d.widgets),
        )
        for d in dashboards
    ]


@router.get("/dashboards/{dashboard_id}", response_model=DashboardOut)
def get_dashboard(
    dashboard_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_dashboard_for_member(db, dashboard_id, current_user)


@router.patch("/dashboards/{dashboard_id}", response_model=DashboardOut)
def update_dashboard(
    dashboard_id: uuid.UUID,
    payload: DashboardUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dashboard = _get_dashboard_for_role(db, dashboard_id, current_user, ANALYST)
    if payload.name is not None:
        dashboard.name = payload.name
    if payload.description is not None:
        dashboard.description = payload.description
    db.commit()
    db.refresh(dashboard)
    return dashboard


@router.delete("/dashboards/{dashboard_id}", status_code=204)
def delete_dashboard(
    dashboard_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dashboard = _get_dashboard_for_role(db, dashboard_id, current_user, ANALYST)
    db.delete(dashboard)
    db.commit()
    return None


@router.post("/dashboards/{dashboard_id}/widgets", response_model=WidgetOut, status_code=201)
def add_widget(
    dashboard_id: uuid.UUID,
    payload: WidgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dashboard = _get_dashboard_for_role(db, dashboard_id, current_user, ANALYST)
    widget = DashboardWidget(
        dashboard_id=dashboard.id,
        widget_type=payload.widget_type,
        title=payload.title,
        config=payload.config,
        layout=payload.layout.model_dump(),
        sort_order=len(dashboard.widgets),
    )
    db.add(widget)
    db.commit()
    db.refresh(widget)
    return widget


def _get_widget_for_role(
    db: Session, widget_id: uuid.UUID, user: User, minimum: str
) -> DashboardWidget:
    widget = db.query(DashboardWidget).filter(DashboardWidget.id == widget_id).first()
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    dashboard = _get_dashboard(db, widget.dashboard_id)
    require_project_role(db, dashboard.project_id, user.id, minimum)
    return widget


@router.patch("/widgets/{widget_id}", response_model=WidgetOut)
def update_widget(
    widget_id: uuid.UUID,
    payload: WidgetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    widget = _get_widget_for_role(db, widget_id, current_user, ANALYST)
    if payload.title is not None:
        widget.title = payload.title
    if payload.config is not None:
        widget.config = payload.config
    if payload.layout is not None:
        widget.layout = payload.layout.model_dump()
    db.commit()
    db.refresh(widget)
    return widget


@router.delete("/widgets/{widget_id}", status_code=204)
def delete_widget(
    widget_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    widget = _get_widget_for_role(db, widget_id, current_user, ANALYST)
    db.delete(widget)
    db.commit()
    return None


@router.get("/dashboards/{dashboard_id}/data")
def get_dashboard_data(
    dashboard_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Computes every widget's current data in one call — see
    core/dashboard_engine.py. Returns {widget_id: computed_result}.
    """
    dashboard = _get_dashboard_for_member(db, dashboard_id, current_user)

    records = db.query(Record).filter(Record.project_id == dashboard.project_id).all()
    records_by_asset_type: dict[str, list] = defaultdict(list)
    for r in records:
        records_by_asset_type[str(r.asset_type_id)].append(r)

    return {str(w.id): compute_widget(w, records_by_asset_type) for w in dashboard.widgets}
