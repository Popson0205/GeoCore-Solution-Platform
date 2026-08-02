import logging
import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, selectinload

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import (
    get_organisation_for_member,
    get_project_for_member,
    require_active_license,
    require_org_role,
    require_project_role,
)
from backend.app.core.dashboard_engine import compute_widget
from backend.app.core.database import get_db
from backend.app.core.roles import ANALYST
from backend.app.models.dashboard import Dashboard, DashboardWidget
from backend.app.models.feature_layer import FeatureLayer
from backend.app.models.project import Project
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
logger = logging.getLogger(__name__)


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
    # Resolved through organisation_id, not the now-optional project_id
    # folder tag.
    get_organisation_for_member(db, dashboard.organisation_id, user.id)
    return dashboard


def _get_dashboard_for_role(
    db: Session, dashboard_id: uuid.UUID, user: User, minimum: str
) -> Dashboard:
    dashboard = _get_dashboard(db, dashboard_id)
    require_org_role(db, dashboard.organisation_id, user.id, minimum)
    return dashboard


# ---------------------------------------------------------------------------
# Organisation-scoped dashboards — the "actual queryable at the Portal, not
# walled in a Project" behaviour.
# ---------------------------------------------------------------------------


@router.post(
    "/organisations/{organisation_id}/dashboards", response_model=DashboardOut, status_code=201
)
def create_dashboard_for_organisation(
    organisation_id: uuid.UUID,
    payload: DashboardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Building a dashboard is an analysis task, not a data-structure change
    # — Analyst and above (blueprint section 13's "Analyst: view, filter,
    # analyse and export data").
    require_org_role(db, organisation_id, current_user.id, ANALYST)
    require_active_license(db, organisation_id)

    project_id = payload.project_id
    if project_id is not None:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project or project.organisation_id != organisation_id:
            raise HTTPException(
                status_code=404, detail="Project not found in this organisation"
            )

    dashboard = Dashboard(
        organisation_id=organisation_id,
        project_id=project_id,
        name=payload.name,
        description=payload.description,
    )
    db.add(dashboard)
    db.commit()
    db.refresh(dashboard)
    return dashboard


@router.get(
    "/organisations/{organisation_id}/dashboards", response_model=list[DashboardSummaryOut]
)
def list_dashboards_for_organisation(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_organisation_for_member(db, organisation_id, current_user.id)
    dashboards = (
        db.query(Dashboard)
        .options(selectinload(Dashboard.widgets))
        .filter(Dashboard.organisation_id == organisation_id)
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


# ---------------------------------------------------------------------------
# Deprecated project-scoped routes — kept so clients still built against the
# old shape keep working. New integrations should use the organisation-
# scoped routes above.
# ---------------------------------------------------------------------------


@router.post(
    "/projects/{project_id}/dashboards",
    response_model=DashboardOut,
    status_code=201,
    deprecated=True,
)
def create_dashboard(
    project_id: uuid.UUID,
    payload: DashboardCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deprecated — use `POST /organisations/{organisation_id}/dashboards`
    with `project_id` as an optional folder tag in the payload instead.
    """
    project, _ = require_project_role(db, project_id, current_user.id, ANALYST)
    require_active_license(db, project.organisation_id)
    response.headers["Deprecation"] = "true"
    logger.warning(
        "Deprecated route called: POST /projects/%s/dashboards "
        "(use POST /organisations/{organisation_id}/dashboards instead)",
        project_id,
    )
    dashboard = Dashboard(
        organisation_id=project.organisation_id,
        project_id=project_id,
        name=payload.name,
        description=payload.description,
    )
    db.add(dashboard)
    db.commit()
    db.refresh(dashboard)
    return dashboard


@router.get(
    "/projects/{project_id}/dashboards",
    response_model=list[DashboardSummaryOut],
    deprecated=True,
)
def list_dashboards(
    project_id: uuid.UUID,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deprecated — use `GET /organisations/{organisation_id}/dashboards`
    and filter client-side by `project_id` if you still want the folder
    view.
    """
    get_project_for_member(db, project_id, current_user.id)
    response.headers["Deprecation"] = "true"
    logger.warning(
        "Deprecated route called: GET /projects/%s/dashboards "
        "(use GET /organisations/{organisation_id}/dashboards instead)",
        project_id,
    )
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
    if payload.theme is not None:
        dashboard.theme = payload.theme
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


def _validate_widget_feature_layer(db: Session, dashboard: Dashboard, config: dict) -> None:
    """A widget can point at any feature layer in the *same organisation*
    as this dashboard — not just the dashboard's own project folder. Data
    collected under one survey's feature layer is still a first-class
    layer any dashboard in the org can chart, the way an ArcGIS Online
    organisation's feature layers aren't locked to a single map.
    Cross-*organisation* references are never allowed — that would cross
    the tenant boundary from blueprint section 7.
    """
    feature_layer_id = config.get("feature_layer_id")
    if not feature_layer_id:
        return
    layer = db.query(FeatureLayer).filter(FeatureLayer.id == feature_layer_id).first()
    if not layer:
        raise HTTPException(status_code=404, detail="That feature layer no longer exists")
    if layer.organisation_id != dashboard.organisation_id:
        raise HTTPException(
            status_code=403, detail="That layer belongs to a different organisation"
        )


@router.post("/dashboards/{dashboard_id}/widgets", response_model=WidgetOut, status_code=201)
def add_widget(
    dashboard_id: uuid.UUID,
    payload: WidgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dashboard = _get_dashboard_for_role(db, dashboard_id, current_user, ANALYST)
    require_active_license(db, dashboard.organisation_id)
    _validate_widget_feature_layer(db, dashboard, payload.config)
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
    require_org_role(db, dashboard.organisation_id, user.id, minimum)
    return widget


@router.patch("/widgets/{widget_id}", response_model=WidgetOut)
def update_widget(
    widget_id: uuid.UUID,
    payload: WidgetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    widget = _get_widget_for_role(db, widget_id, current_user, ANALYST)
    if payload.config is not None:
        dashboard = _get_dashboard(db, widget.dashboard_id)
        _validate_widget_feature_layer(db, dashboard, payload.config)
        widget.config = payload.config
    if payload.title is not None:
        widget.title = payload.title
    if payload.layout is not None:
        widget.layout = payload.layout.model_dump()
    if payload.sort_order is not None:
        widget.sort_order = payload.sort_order
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

    Records are fetched per-widget by the feature_layer_id each widget's
    config actually references (any layer in the org — see
    _validate_widget_feature_layer), not by a project_id. Map widgets
    with no feature_layer_id (=> "every layer in the organisation") pull
    the whole organisation's records rather than one project's — a
    dashboard's map is Portal-wide by default, the same way its widget
    picker already draws from any layer in the org.
    """
    dashboard = _get_dashboard_for_member(db, dashboard_id, current_user)

    referenced_ids = {
        w.config.get("feature_layer_id") for w in dashboard.widgets if w.config.get("feature_layer_id")
    }
    needs_org_records = any(
        w.widget_type == "map" and not w.config.get("feature_layer_id") for w in dashboard.widgets
    )

    records_by_layer: dict[str, list] = defaultdict(list)
    if referenced_ids:
        for r in db.query(Record).filter(Record.feature_layer_id.in_(referenced_ids)).all():
            records_by_layer[str(r.feature_layer_id)].append(r)
    if needs_org_records:
        for r in db.query(Record).filter(Record.organisation_id == dashboard.organisation_id).all():
            records_by_layer[str(r.feature_layer_id)].append(r)

    return {str(w.id): compute_widget(w, records_by_layer) for w in dashboard.widgets}
