"""survey entity baseline: surveys table + nullable survey_id/organisation_id

Revision ID: de35016a2782
Revises: a5d1f98f5728
Create Date: 2026-07-30 10:23:16.000000

GeoCore Portal redesign — Phase 3 of the 10-phase implementation plan
(original proposal Phase 1, part 1): stand up the new Survey entity
without touching existing tables' data or constraints yet.

- Creates the `surveys` table (organisation_id is the real tenancy anchor;
  project_id is an optional folder-style grouping, nullable).
- Adds `survey_id` to `asset_types`, nullable, alongside the existing
  `project_id` — the FK re-point and the drop of `project_id` /
  submission_* columns from asset_types are Phase 4's job, once every row
  is backfilled.
- Adds `organisation_id` and `survey_id` to `records`, both nullable,
  alongside the existing `project_id` — same reasoning: Phase 4 backfills
  every row and only then flips these to NOT NULL.

Every new column is nullable so this migration is a pure additive,
non-breaking step: no existing row or endpoint behaviour changes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'de35016a2782'
down_revision: Union[str, Sequence[str], None] = 'a5d1f98f5728'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'surveys',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organisation_id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('submission_token', sa.String(), nullable=True),
        sa.Column('submission_enabled', sa.Boolean(), nullable=False),
        sa.Column('submission_access', sa.String(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organisation_id'], ['organisations.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_surveys_organisation_id'), 'surveys', ['organisation_id'], unique=False)
    op.create_index(op.f('ix_surveys_submission_token'), 'surveys', ['submission_token'], unique=True)

    op.add_column('asset_types', sa.Column('survey_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_asset_types_survey_id'), 'asset_types', ['survey_id'], unique=False)
    op.create_foreign_key(
        'fk_asset_types_survey_id_surveys', 'asset_types', 'surveys', ['survey_id'], ['id']
    )

    op.add_column('records', sa.Column('organisation_id', sa.UUID(), nullable=True))
    op.add_column('records', sa.Column('survey_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_records_organisation_id'), 'records', ['organisation_id'], unique=False)
    op.create_index(op.f('ix_records_survey_id'), 'records', ['survey_id'], unique=False)
    op.create_foreign_key(
        'fk_records_organisation_id_organisations', 'records', 'organisations', ['organisation_id'], ['id']
    )
    op.create_foreign_key(
        'fk_records_survey_id_surveys', 'records', 'surveys', ['survey_id'], ['id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_records_survey_id_surveys', 'records', type_='foreignkey')
    op.drop_constraint('fk_records_organisation_id_organisations', 'records', type_='foreignkey')
    op.drop_index(op.f('ix_records_survey_id'), table_name='records')
    op.drop_index(op.f('ix_records_organisation_id'), table_name='records')
    op.drop_column('records', 'survey_id')
    op.drop_column('records', 'organisation_id')

    op.drop_constraint('fk_asset_types_survey_id_surveys', 'asset_types', type_='foreignkey')
    op.drop_index(op.f('ix_asset_types_survey_id'), table_name='asset_types')
    op.drop_column('asset_types', 'survey_id')

    op.drop_index(op.f('ix_surveys_submission_token'), table_name='surveys')
    op.drop_index(op.f('ix_surveys_organisation_id'), table_name='surveys')
    op.drop_table('surveys')

