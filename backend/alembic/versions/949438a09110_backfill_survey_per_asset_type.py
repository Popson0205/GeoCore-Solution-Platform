"""backfill: one Survey per existing AssetType, migrate SubmissionAssignee

Revision ID: 949438a09110
Revises: de35016a2782
Create Date: 2026-07-30 11:00:00.000000

GeoCore Portal redesign — Phase 4 of the 10-phase implementation plan
(original proposal Phase 1, part 2), migration 2 of 3.

Data-only migration (plus the small schema change SubmissionAssignee's
re-point requires): for every existing AssetType, creates exactly one
Survey to be its container, so no AssetType is ever left without a parent
Survey once Migration 4 makes `asset_types.survey_id` NOT NULL. The
Survey's submission_token/enabled/access are carried over from the
AssetType (blueprint section 7 sharing moved from AssetType up to Survey
in this redesign), and SubmissionAssignee rows are re-pointed from the
AssetType they used to reference to that new Survey.

Uses ad hoc table() definitions rather than importing the ORM models, so
this migration keeps working exactly as written even after the models
change further down the line.
"""
from typing import Sequence, Union
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '949438a09110'
down_revision: Union[str, Sequence[str], None] = 'de35016a2782'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


asset_types = sa.table(
    'asset_types',
    sa.column('id', sa.UUID()),
    sa.column('project_id', sa.UUID()),
    sa.column('survey_id', sa.UUID()),
    sa.column('name', sa.String()),
    sa.column('submission_token', sa.String()),
    sa.column('submission_enabled', sa.Boolean()),
    sa.column('submission_access', sa.String()),
    sa.column('created_at', sa.DateTime(timezone=True)),
)

projects = sa.table(
    'projects',
    sa.column('id', sa.UUID()),
    sa.column('organisation_id', sa.UUID()),
)

surveys = sa.table(
    'surveys',
    sa.column('id', sa.UUID()),
    sa.column('organisation_id', sa.UUID()),
    sa.column('project_id', sa.UUID()),
    sa.column('title', sa.String()),
    sa.column('status', sa.String()),
    sa.column('submission_token', sa.String()),
    sa.column('submission_enabled', sa.Boolean()),
    sa.column('submission_access', sa.String()),
    sa.column('created_at', sa.DateTime(timezone=True)),
)

submission_assignees = sa.table(
    'submission_assignees',
    sa.column('id', sa.UUID()),
    sa.column('asset_type_id', sa.UUID()),
    sa.column('survey_id', sa.UUID()),
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    # submission_assignees needs a survey_id column to re-point into before
    # it can be backfilled; it doesn't have one yet.
    op.add_column('submission_assignees', sa.Column('survey_id', sa.UUID(), nullable=True))

    asset_type_rows = bind.execute(
        sa.select(
            asset_types.c.id,
            asset_types.c.project_id,
            asset_types.c.name,
            asset_types.c.submission_token,
            asset_types.c.submission_enabled,
            asset_types.c.submission_access,
            asset_types.c.created_at,
        )
    ).fetchall()

    project_org_cache: dict = {}

    for row in asset_type_rows:
        if row.project_id not in project_org_cache:
            project_row = bind.execute(
                sa.select(projects.c.organisation_id).where(projects.c.id == row.project_id)
            ).first()
            project_org_cache[row.project_id] = project_row.organisation_id if project_row else None

        organisation_id = project_org_cache[row.project_id]
        if organisation_id is None:
            # The asset type's project vanished/was orphaned pre-redesign —
            # skip rather than create a Survey with no organisation.
            continue

        survey_id = uuid.uuid4()
        bind.execute(
            surveys.insert().values(
                id=survey_id,
                organisation_id=organisation_id,
                project_id=row.project_id,
                title=row.name,
                status="published",
                submission_token=row.submission_token,
                submission_enabled=row.submission_enabled,
                submission_access=row.submission_access,
                created_at=row.created_at or datetime.now(timezone.utc),
            )
        )
        bind.execute(
            asset_types.update()
            .where(asset_types.c.id == row.id)
            .values(survey_id=survey_id)
        )
        bind.execute(
            submission_assignees.update()
            .where(submission_assignees.c.asset_type_id == row.id)
            .values(survey_id=survey_id)
        )

    # Every submission_assignees row now has its survey_id — drop the old
    # asset_type_id FK/column, matching the current SubmissionAssignee model.
    op.drop_constraint(
        'submission_assignees_asset_type_id_fkey', 'submission_assignees', type_='foreignkey'
    )
    op.drop_column('submission_assignees', 'asset_type_id')
    op.alter_column('submission_assignees', 'survey_id', existing_type=sa.UUID(), nullable=False)
    op.create_index(
        op.f('ix_submission_assignees_survey_id'), 'submission_assignees', ['survey_id'], unique=False
    )
    op.create_foreign_key(
        'fk_submission_assignees_survey_id_surveys',
        'submission_assignees', 'surveys', ['survey_id'], ['id'],
    )


def downgrade() -> None:
    """Downgrade schema.

    Reverses the schema changes only. The backfilled data (created Surveys,
    populated asset_types.survey_id) is intentionally left in place —
    dropping it would silently orphan any Records/AssetTypes created after
    this migration ran. submission_assignees.asset_type_id is restored as a
    nullable column with no data (it can't be reconstructed from survey_id
    alone, since Migration 2's mapping was one Survey per AssetType, not the
    reverse).
    """
    op.drop_constraint(
        'fk_submission_assignees_survey_id_surveys', 'submission_assignees', type_='foreignkey'
    )
    op.drop_index(op.f('ix_submission_assignees_survey_id'), table_name='submission_assignees')
    op.add_column(
        'submission_assignees', sa.Column('asset_type_id', sa.UUID(), nullable=True)
    )
    op.create_foreign_key(
        'submission_assignees_asset_type_id_fkey',
        'submission_assignees', 'asset_types', ['asset_type_id'], ['id'],
    )
    op.drop_column('submission_assignees', 'survey_id')

