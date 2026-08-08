"""add parcel_merge_sources join table (Phase 2: parcel lineage)

Revision ID: e9c5a3f7d2b8
Revises: d7b2f4a9c1e6
Create Date: 2026-08-08 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e9c5a3f7d2b8'
down_revision: Union[str, Sequence[str], None] = 'd7b2f4a9c1e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'parcel_merge_sources',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('child_record_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('records.id'), nullable=False),
        sa.Column('parent_record_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('records.id'), nullable=False),
    )
    op.create_index('ix_parcel_merge_sources_child_record_id', 'parcel_merge_sources', ['child_record_id'])
    op.create_index('ix_parcel_merge_sources_parent_record_id', 'parcel_merge_sources', ['parent_record_id'])


def downgrade() -> None:
    op.drop_index('ix_parcel_merge_sources_parent_record_id', table_name='parcel_merge_sources')
    op.drop_index('ix_parcel_merge_sources_child_record_id', table_name='parcel_merge_sources')
    op.drop_table('parcel_merge_sources')
