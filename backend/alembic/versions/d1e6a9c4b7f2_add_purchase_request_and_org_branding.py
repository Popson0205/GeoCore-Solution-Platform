"""add purchase-request fields and org branding image/domain

Revision ID: d1e6a9c4b7f2
Revises: c9d4f7b3a8e5
Create Date: 2026-08-02 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd1e6a9c4b7f2'
down_revision: Union[str, Sequence[str], None] = 'c9d4f7b3a8e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('customers', sa.Column('status', sa.String(), nullable=False, server_default='lead'))
    op.add_column('customers', sa.Column('requested_plan', sa.String(), nullable=True))
    op.add_column('customers', sa.Column('requested_tier', sa.String(), nullable=True))
    op.add_column('customers', sa.Column('requested_seats', sa.String(), nullable=True))
    op.add_column('customers', sa.Column('requested_organisation_name', sa.String(), nullable=True))
    op.add_column('customers', sa.Column('desired_domain', sa.String(), nullable=True))

    op.add_column('organisations', sa.Column('banner_image_path', sa.String(), nullable=True))
    op.add_column('organisations', sa.Column('custom_domain', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('organisations', 'custom_domain')
    op.drop_column('organisations', 'banner_image_path')

    op.drop_column('customers', 'desired_domain')
    op.drop_column('customers', 'requested_organisation_name')
    op.drop_column('customers', 'requested_seats')
    op.drop_column('customers', 'requested_tier')
    op.drop_column('customers', 'requested_plan')
    op.drop_column('customers', 'status')
