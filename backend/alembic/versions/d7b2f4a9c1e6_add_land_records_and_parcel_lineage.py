"""add land_records table and parcel lineage columns on records

Revision ID: d7b2f4a9c1e6
Revises: c4a8e2f6b9d3
Create Date: 2026-08-08 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd7b2f4a9c1e6'
down_revision: Union[str, Sequence[str], None] = 'c4a8e2f6b9d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'land_records',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id'), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id'), nullable=True),
        sa.Column('record_type', sa.String(), nullable=False),
        sa.Column('record_number', sa.String(), nullable=True),
        sa.Column('record_date', sa.Date(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('document_file_name', sa.String(), nullable=True),
        sa.Column('document_content_type', sa.String(), nullable=True),
        sa.Column('document_size_bytes', sa.Integer(), nullable=True),
        sa.Column('document_storage_path', sa.String(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_land_records_organisation_id', 'land_records', ['organisation_id'])

    op.add_column('records', sa.Column('parent_record_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_records_parent_record_id', 'records', 'records', ['parent_record_id'], ['id']
    )
    op.create_index('ix_records_parent_record_id', 'records', ['parent_record_id'])

    op.add_column('records', sa.Column('status', sa.String(), nullable=True))

    op.add_column('records', sa.Column('land_record_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_records_land_record_id', 'records', 'land_records', ['land_record_id'], ['id']
    )
    op.create_index('ix_records_land_record_id', 'records', ['land_record_id'])


def downgrade() -> None:
    op.drop_index('ix_records_land_record_id', table_name='records')
    op.drop_constraint('fk_records_land_record_id', 'records', type_='foreignkey')
    op.drop_column('records', 'land_record_id')

    op.drop_column('records', 'status')

    op.drop_index('ix_records_parent_record_id', table_name='records')
    op.drop_constraint('fk_records_parent_record_id', 'records', type_='foreignkey')
    op.drop_column('records', 'parent_record_id')

    op.drop_index('ix_land_records_organisation_id', table_name='land_records')
    op.drop_table('land_records')
