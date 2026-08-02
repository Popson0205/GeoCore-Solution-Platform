"""split Survey (form) from FeatureLayer (data source)

Revision ID: a4f7c2e9b6d3
Revises: d1e6a9c4b7f2
Create Date: 2026-08-03 10:00:00.000000

GeoCore's Survey used to be both the form definition AND the data
container in one row (the Portal redesign's earlier "flat" model). This
splits those back into two genuinely separate things, matching how
ArcGIS Survey123 creates a Form item and a Feature Layer item together:
a Survey still owns the form (sections/fields/submission link); a new
FeatureLayer owns the geometry_type/color/sharing and is what Records
actually belong to and what Dashboards/Maps bind to as a data source.

For every existing Survey, this creates exactly one FeatureLayer (copying
geometry_type/color/title across), then re-points every Record from
survey_id-only to also carry the new feature_layer_id. survey_id stays on
Record as a denormalized "which form produced this" reference -- nothing
is dropped, only added.

Uses ad hoc table() definitions rather than importing the ORM models
(same convention as migration 949438a09110), so this keeps working
exactly as written even after the models change further down the line.
"""
from typing import Sequence, Union
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a4f7c2e9b6d3'
down_revision: Union[str, Sequence[str], None] = 'd1e6a9c4b7f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


surveys = sa.table(
    'surveys',
    sa.column('id', postgresql.UUID(as_uuid=True)),
    sa.column('organisation_id', postgresql.UUID(as_uuid=True)),
    sa.column('project_id', postgresql.UUID(as_uuid=True)),
    sa.column('title', sa.String()),
    sa.column('geometry_type', sa.String()),
    sa.column('color', sa.String()),
    sa.column('created_at', sa.DateTime(timezone=True)),
)

feature_layers = sa.table(
    'feature_layers',
    sa.column('id', postgresql.UUID(as_uuid=True)),
    sa.column('organisation_id', postgresql.UUID(as_uuid=True)),
    sa.column('project_id', postgresql.UUID(as_uuid=True)),
    sa.column('survey_id', postgresql.UUID(as_uuid=True)),
    sa.column('name', sa.String()),
    sa.column('geometry_type', sa.String()),
    sa.column('color', sa.String()),
    sa.column('share_enabled', sa.Boolean()),
    sa.column('created_at', sa.DateTime(timezone=True)),
    sa.column('updated_at', sa.DateTime(timezone=True)),
)

records = sa.table(
    'records',
    sa.column('id', postgresql.UUID(as_uuid=True)),
    sa.column('survey_id', postgresql.UUID(as_uuid=True)),
    sa.column('feature_layer_id', postgresql.UUID(as_uuid=True)),
)


def upgrade() -> None:
    op.create_table(
        'feature_layers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id'), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id'), nullable=True),
        sa.Column('survey_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('surveys.id'), nullable=False, unique=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('geometry_type', sa.String(), nullable=False, server_default='point'),
        sa.Column('color', sa.String(), nullable=False, server_default='#0079c1'),
        sa.Column('share_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('share_token', sa.String(), nullable=True, unique=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_feature_layers_organisation_id', 'feature_layers', ['organisation_id'])
    op.create_index('ix_feature_layers_survey_id', 'feature_layers', ['survey_id'], unique=True)
    op.create_index('ix_feature_layers_share_token', 'feature_layers', ['share_token'], unique=True)

    op.add_column('records', sa.Column('feature_layer_id', postgresql.UUID(as_uuid=True), nullable=True))

    bind = op.get_bind()

    survey_rows = bind.execute(
        sa.select(
            surveys.c.id,
            surveys.c.organisation_id,
            surveys.c.project_id,
            surveys.c.title,
            surveys.c.geometry_type,
            surveys.c.color,
            surveys.c.created_at,
        )
    ).fetchall()

    for row in survey_rows:
        layer_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        bind.execute(
            feature_layers.insert().values(
                id=layer_id,
                organisation_id=row.organisation_id,
                project_id=row.project_id,
                survey_id=row.id,
                name=row.title,
                geometry_type=row.geometry_type,
                color=row.color,
                share_enabled=False,
                created_at=row.created_at or now,
                updated_at=now,
            )
        )
        bind.execute(
            records.update().where(records.c.survey_id == row.id).values(feature_layer_id=layer_id)
        )

    # Every Record's survey_id maps to exactly one just-created FeatureLayer
    # (a Survey with zero Records simply backfills zero rows), so this is
    # safe to enforce now rather than leaving it nullable indefinitely.
    op.alter_column('records', 'feature_layer_id', existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.create_index('ix_records_feature_layer_id', 'records', ['feature_layer_id'])
    op.create_foreign_key(
        'fk_records_feature_layer_id_feature_layers',
        'records', 'feature_layers', ['feature_layer_id'], ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_records_feature_layer_id_feature_layers', 'records', type_='foreignkey')
    op.drop_index('ix_records_feature_layer_id', table_name='records')
    op.drop_column('records', 'feature_layer_id')

    op.drop_index('ix_feature_layers_share_token', table_name='feature_layers')
    op.drop_index('ix_feature_layers_survey_id', table_name='feature_layers')
    op.drop_index('ix_feature_layers_organisation_id', table_name='feature_layers')
    op.drop_table('feature_layers')
