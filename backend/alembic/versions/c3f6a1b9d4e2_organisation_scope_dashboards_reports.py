"""organisation-scope dashboards and reports (Portal redesign Phase 2, this Phase 6)

Revision ID: c3f6a1b9d4e2
Revises: 701368ee810a
Create Date: 2026-07-30 14:20:00.000000

GeoCore Portal redesign — Phase 6 of the 10-phase implementation plan.
Dashboards and Reports move from being walled inside a single Project to
being addressable Portal-wide (organisation-scoped), the same way Records
became organisation/survey-scoped in Phase 4 — see models/dashboard.py and
models/report.py.

- `dashboards.organisation_id` / `reports.organisation_id` added NOT NULL,
  backfilled from `projects.organisation_id` via each row's existing
  `project_id` (every existing dashboard/report was created under a
  project, so this backfill is exhaustive — no orphan rows are possible).
- `dashboards.project_id` / `reports.project_id` relaxed to nullable — it's
  now just an optional folder tag, no longer the scope boundary, mirroring
  `records.project_id` from Phase 4.

Single migration (not staged nullable -> backfill -> NOT NULL across
several revisions like Phase 4) because, unlike Phase 4's models, nothing
reads `organisation_id` yet until this same phase's route changes land —
there's no window where partially-migrated data could be read incorrectly.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3f6a1b9d4e2'
down_revision: Union[str, Sequence[str], None] = '701368ee810a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # --- dashboards: add organisation_id, backfill, lock, relax project_id ---
    op.add_column('dashboards', sa.Column('organisation_id', sa.UUID(), nullable=True))
    op.execute(
        """
        UPDATE dashboards
        SET organisation_id = projects.organisation_id
        FROM projects
        WHERE dashboards.project_id = projects.id
        """
    )
    op.alter_column('dashboards', 'organisation_id', existing_type=sa.UUID(), nullable=False)
    op.create_index(
        op.f('ix_dashboards_organisation_id'), 'dashboards', ['organisation_id']
    )
    op.create_foreign_key(
        'dashboards_organisation_id_fkey', 'dashboards', 'organisations', ['organisation_id'], ['id']
    )
    op.alter_column('dashboards', 'project_id', existing_type=sa.UUID(), nullable=True)

    # --- reports: same treatment ---
    op.add_column('reports', sa.Column('organisation_id', sa.UUID(), nullable=True))
    op.execute(
        """
        UPDATE reports
        SET organisation_id = projects.organisation_id
        FROM projects
        WHERE reports.project_id = projects.id
        """
    )
    op.alter_column('reports', 'organisation_id', existing_type=sa.UUID(), nullable=False)
    op.create_index(
        op.f('ix_reports_organisation_id'), 'reports', ['organisation_id']
    )
    op.create_foreign_key(
        'reports_organisation_id_fkey', 'reports', 'organisations', ['organisation_id'], ['id']
    )
    op.alter_column('reports', 'project_id', existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('reports', 'project_id', existing_type=sa.UUID(), nullable=False)
    op.drop_constraint('reports_organisation_id_fkey', 'reports', type_='foreignkey')
    op.drop_index(op.f('ix_reports_organisation_id'), table_name='reports')
    op.drop_column('reports', 'organisation_id')

    op.alter_column('dashboards', 'project_id', existing_type=sa.UUID(), nullable=False)
    op.drop_constraint('dashboards_organisation_id_fkey', 'dashboards', type_='foreignkey')
    op.drop_index(op.f('ix_dashboards_organisation_id'), table_name='dashboards')
    op.drop_column('dashboards', 'organisation_id')
