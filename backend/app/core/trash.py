"""The trash/recycle-bin mechanism shared by Survey and Dashboard
deletion. A "deleted" item isn't gone — it's marked deleted_at=now() and
stays fully restorable for TRASH_RETENTION_DAYS, then gets permanently
purged the next time anyone's trash list happens to be queried past
that point.

Purging is deliberately lazy (checked on read, not on a cron schedule)
rather than needing a background job/scheduler as new infrastructure —
a pragmatic trade-off for a feature where being purged "on day 8 instead
of exactly on day 7" has no real consequence. See list_trash in
routes/organisations.py for where this gets called.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend.app.models.dashboard import Dashboard
from backend.app.models.survey import Survey

TRASH_RETENTION_DAYS = 7


def purge_at(deleted_at: datetime) -> datetime:
    return deleted_at + timedelta(days=TRASH_RETENTION_DAYS)


def purge_expired_trash(db: Session, organisation_id) -> None:
    """Permanently deletes anything past its retention window. Survey
    deletion cascades to its FeatureLayer and every Record under it (see
    models/survey.py and models/feature_layer.py's cascade config);
    Dashboard deletion cascades to its widgets. Called at the start of
    list_trash so the bin never shows something already past its date —
    not on every request, to avoid doing this work constantly.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=TRASH_RETENTION_DAYS)

    expired_surveys = (
        db.query(Survey)
        .filter(
            Survey.organisation_id == organisation_id,
            Survey.deleted_at.isnot(None),
            Survey.deleted_at <= cutoff,
        )
        .all()
    )
    for survey in expired_surveys:
        db.delete(survey)

    expired_dashboards = (
        db.query(Dashboard)
        .filter(
            Dashboard.organisation_id == organisation_id,
            Dashboard.deleted_at.isnot(None),
            Dashboard.deleted_at <= cutoff,
        )
        .all()
    )
    for dashboard in expired_dashboards:
        db.delete(dashboard)

    if expired_surveys or expired_dashboards:
        db.commit()
