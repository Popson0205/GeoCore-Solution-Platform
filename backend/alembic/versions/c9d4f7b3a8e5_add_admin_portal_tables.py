"""add admin portal: platform admin flag, customers, licenses

Revision ID: c9d4f7b3a8e5
Revises: b8c3e6a2f4d1
Create Date: 2026-08-01 23:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c9d4f7b3a8e5'
down_revision: Union[str, Sequence[str], None] = 'b8c3e6a2f4d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('is_platform_admin', sa.Boolean(), nullable=False, server_default='false'),
    )

    op.create_table(
        'customers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('customer_number', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_customers_customer_number', 'customers', ['customer_number'], unique=True)

    op.create_table(
        'licenses',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('customer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('customers.id'), nullable=False),
        sa.Column('license_key', sa.Text(), nullable=False, unique=True),
        sa.Column('plan', sa.String(), nullable=False),
        sa.Column('tier', sa.String(), nullable=True),
        sa.Column('seat_limit', sa.Integer(), nullable=True),
        sa.Column('duration_type', sa.String(), nullable=False),
        sa.Column('deployment_mode', sa.String(), nullable=False),
        sa.Column('issued_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='issued'),
        sa.Column('applied_organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id'), nullable=True),
        sa.Column('sent_to_email', sa.String(), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('issued_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_licenses_customer_id', 'licenses', ['customer_id'])


def downgrade() -> None:
    op.drop_index('ix_licenses_customer_id', table_name='licenses')
    op.drop_table('licenses')
    op.drop_index('ix_customers_customer_number', table_name='customers')
    op.drop_table('customers')
    op.drop_column('users', 'is_platform_admin')
