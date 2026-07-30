import logging
import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from backend.app.api.deps import get_current_user
from backend.app.api.deps_project import (
    get_organisation_for_member,
    get_project_for_member,
    require_org_role,
    require_project_role,
)
from backend.app.core.dashboard_engine import compute_widget
from backend.app.core.database import get_db
from backend.app.core.roles import ANALYST, VIEWER
from backend.app.models.asset_type import AssetType
from backend.app.models.dashboard import Dashboard, DashboardWidget
from backend.app.models.project import Project
from backend.app.models.record import Record
from backend.app.models.survey import Survey
from backend.app.models.user import User
from backend.app.schemas.dashboards import (
    DashboardCreate,
    DashboardOut,
    DashboardSummaryOut,
    DashboardUpdate,
    FeatureLayerOut,
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
    # folder tag (Portal redesign Phase 2, this Phase 6).
    get_organisation_for_member(db, dashboard.organisation_id, user.id)
    return dashboard


def _get_dashboard_for_role(
    db: Session, dashboard_id: uuid.UUID, user: User, minimum: str
) -> Dashboard:
    dashboard = _get_dashboard(db, dashboard_id)
    require_org_role(db, dashboard.organisation_id, user.id, minimum)
    return dashboard


# ---------------------------------------------------------------------------
# Organisation-scoped dashboards (Portal redesign Phase 2, this Phase 6) —
# the "actual queryable at the Portal, not walled in a Project" behaviour.
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
# old shape keep working (Portal redesign Phase 2, this Phase 6). New
# integrations should use the organisation-scoped routes above.
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


def _validate_widget_asset_type(db: Session, dashboard: Dashboard, config: dict) -> None:
    """A widget can point at any asset type in the *same organisation* as
    this dashboard — not just the dashboard's own project folder. This is
    the "feature layer" model: data collected under one survey is still a
    first-class layer any dashboard in the org can chart, the way an
    ArcGIS Online organisation's feature layers aren't locked to a single
    map. Cross-*organisation* references are never allowed — that would
    cross the tenant boundary from blueprint section 7.

    Resolved through the asset type's Survey (Portal redesign Phase 1) —
    an AssetType no longer has its own project_id, and a dashboard's real
    tenancy anchor is organisation_id, not its optional project folder
    (Portal redesign Phase 2, this Phase 6) — so comparing organisation_id
    directly on both sides is simpler and more correct than the old
    Project-to-Project join.
    """
    asset_type_id = config.get("asset_type_id")
    if not asset_type_id:
        return
    asset_type = db.query(AssetType).filter(AssetType.id == asset_type_id).first()
    if not asset_type:
        raise HTTPException(status_code=404, detail="That layer's asset type no longer exists")
    survey = db.query(Survey).filter(Survey.id == asset_type.survey_id).first()
    if not survey or survey.organisation_id != dashboard.organisation_id:
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
    _validate_widget_asset_type(db, dashboard, payload.config)
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
        _validate_widget_asset_type(db, dashboard, payload.config)
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

    Records are fetched per-widget by the asset_type_id each widget's
    config actually references (any layer in the org — see
    _validate_widget_asset_type), not by a project_id. Map widgets with no
    asset_type_id (asset_type_id is None => "every layer in the
    organisation") now pull the whole organisation's records rather than
    one project's — this is the Phase 6 behaviour change itself: a
    dashboard's map is Portal-wide by default, the same way its widget
    picker already draws from any layer in the org.
    """
    dashboard = _get_dashboard_for_member(db, dashboard_id, current_user)

    referenced_ids = {
        w.config.get("asset_type_id") for w in dashboard.widgets if w.config.get("asset_type_id")
    }
    needs_org_records = any(
        w.widget_type == "map" and not w.config.get("asset_type_id") for w in dashboard.widgets
    )

    records_by_asset_type: dict[str, list] = defaultdict(list)
    if referenced_ids:
        for r in db.query(Record).filter(Record.asset_type_id.in_(referenced_ids)).all():
            records_by_asset_type[str(r.asset_type_id)].append(r)
    if needs_org_records:
        for r in db.query(Record).filter(Record.organisation_id == dashboard.organisation_id).all():
            records_by_asset_type[str(r.asset_type_id)].append(r)

    return {str(w.id): compute_widget(w, records_by_asset_type) for w in dashboard.widgets}


@router.get("/organisations/{organisation_id}/feature-layers", response_model=list[FeatureLayerOut])
def list_feature_layers(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every asset type across every survey in this organisation, for the
    dashboard widget builder's data-source picker — the "just select the
    layer, even from a different survey/project" model. Read-only
    discovery metadata (name/color/record count), not the records
    themselves.

    Fixed to resolve through Survey (Portal redesign Phase 1) rather than
    the removed `AssetType.project_id` — an asset type's real parent is
    its survey, and that survey's project_id is only ever an optional
    folder tag, so `project_id`/`project_name` below are populated only
    when the survey happens to have one.
    """
    require_org_role(db, organisation_id, current_user.id, VIEWER)

    rows = (
        db.query(AssetType, Survey, Project)
        .join(Survey, Survey.id == AssetType.survey_id)
        .outerjoin(Project, Project.id == Survey.project_id)
        .filter(Survey.organisation_id == organisation_id)
        .all()
    )
    counts = dict(
        db.query(Record.asset_type_id, func.count(Record.id))
        .filter(Record.organisation_id == organisation_id)
        .group_by(Record.asset_type_id)
        .all()
    )

    return [
        FeatureLayerOut(
            asset_type_id=asset_type.id,
            name=asset_type.name,
            color=asset_type.color,
            geometry_type=asset_type.geometry_type,
            survey_id=survey.id,
            survey_title=survey.title,
            project_id=project.id if project else None,
            project_name=project.name if project else None,
            record_count=counts.get(asset_type.id, 0),
        )
        for asset_type, survey, project in rows
    ]
