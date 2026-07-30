"""lock schema: NOT NULL survey_id/organisation_id, drop legacy asset_type columns

Revision ID: 701368ee810a
Revises: 90a27c2abfe2
Create Date: 2026-07-30 11:10:00.000000

GeoCore Portal redesign — Phase 4 of the 10-phase implementation plan,
migration 4 of 4 (schema lock-down). Run only after Migrations 2 and 3
have backfilled every row — this is the migration that actually enforces
it. Matches the current ORM models exactly:

- `asset_types.survey_id` → NOT NULL; drops the old `project_id` FK/column
  and the `submission_token` / `submission_enabled` / `submission_access`
  columns, which moved up to Survey in Migration 2.
- `records.survey_id` / `records.organisation_id` → NOT NULL;
  `records.project_id` is relaxed to nullable — it's now just an optional
  folder tag, no longer the scope boundary (see models/record.py).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '701368ee810a'
down_revision: Union[str, Sequence[str], None] = '90a27c2abfe2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # --- asset_types: lock survey_id, drop the old project scope + submission link ---
    op.alter_column('asset_types', 'survey_id', existing_type=sa.UUID(), nullable=False)

    op.drop_constraint('asset_types_project_id_fkey', 'asset_types', type_='foreignkey')
    op.drop_column('asset_types', 'project_id')

    op.drop_index(op.f('ix_asset_types_submission_token'), table_name='asset_types')
    op.drop_column('asset_types', 'submission_token')
    op.drop_column('asset_types', 'submission_enabled')
    op.drop_column('asset_types', 'submission_access')

    # --- records: lock survey_id/organisation_id, relax project_id ---
    op.alter_column('records', 'survey_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('records', 'organisation_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('records', 'project_id', existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('records', 'project_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('records', 'organisation_id', existing_type=sa.UUID(), nullable=True)
    op.alter_column('records', 'survey_id', existing_type=sa.UUID(), nullable=True)

    op.add_column(
        'asset_types',
        sa.Column('submission_access', sa.String(), nullable=False, server_default='org'),
    )
    op.add_column(
        'asset_types',
        sa.Column('submission_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column('asset_types', sa.Column('submission_token', sa.String(), nullable=True))
    op.create_index(
        op.f('ix_asset_types_submission_token'), 'asset_types', ['submission_token'], unique=True
    )
    op.alter_column('asset_types', 'submission_access', server_default=None)
    op.alter_column('asset_types', 'submission_enabled', server_default=None)

    op.add_column('asset_types', sa.Column('project_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'asset_types_project_id_fkey', 'asset_types', 'projects', ['project_id'], ['id']
    )
    op.alter_column('asset_types', 'survey_id', existing_type=sa.UUID(), nullable=True)

