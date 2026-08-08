"""add parcel_ownerships table (Phase 3: ownership history)

Revision ID: f1a6c8e3b5d9
Revises: e9c5a3f7d2b8
Create Date: 2026-08-08 11:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f1a6c8e3b5d9'
down_revision: Union[str, Sequence[str], None] = 'e9c5a3f7d2b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'parcel_ownerships',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('record_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('records.id'), nullable=False),
        sa.Column('owner_name', sa.String(), nullable=False),
        sa.Column('owner_contact', sa.String(), nullable=True),
        sa.Column('transfer_type', sa.String(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('acquired_date', sa.Date(), nullable=True),
        sa.Column('transferred_date', sa.Date(), nullable=True),
        sa.Column('land_record_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('land_records.id'), nullable=True),
        sa.Column('previous_ownership_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_parcel_ownerships_previous_ownership_id',
        'parcel_ownerships', 'parcel_ownerships', ['previous_ownership_id'], ['id'],
    )
    op.create_index('ix_parcel_ownerships_record_id', 'parcel_ownerships', ['record_id'])


def downgrade() -> None:
    op.drop_index('ix_parcel_ownerships_record_id', table_name='parcel_ownerships')
    op.drop_table('parcel_ownerships')
