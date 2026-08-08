"""add estate_grid_calibrations table

Revision ID: c8f4a1d6b3e7
Revises: a3d7e5f9c2b1
Create Date: 2026-08-08 13:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c8f4a1d6b3e7'
down_revision: Union[str, Sequence[str], None] = 'a3d7e5f9c2b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'estate_grid_calibrations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id'), nullable=False),
        sa.Column('source_epsg', sa.Integer(), nullable=False),
        sa.Column('reference_easting', sa.Float(), nullable=False),
        sa.Column('reference_northing', sa.Float(), nullable=False),
        sa.Column('known_lat', sa.Float(), nullable=False),
        sa.Column('known_lon', sa.Float(), nullable=False),
        sa.Column('label', sa.String(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_estate_grid_calibrations_organisation_id', 'estate_grid_calibrations', ['organisation_id'])
    op.create_unique_constraint(
        'uq_estate_grid_calibrations_org_epsg', 'estate_grid_calibrations', ['organisation_id', 'source_epsg']
    )


def downgrade() -> None:
    op.drop_constraint('uq_estate_grid_calibrations_org_epsg', 'estate_grid_calibrations', type_='unique')
    op.drop_index('ix_estate_grid_calibrations_organisation_id', table_name='estate_grid_calibrations')
    op.drop_table('estate_grid_calibrations')
