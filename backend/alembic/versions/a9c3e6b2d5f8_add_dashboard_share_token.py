"""add dashboard share_token

Revision ID: a9c3e6b2d5f8
Revises: f2a5d8b1e4c7
Create Date: 2026-08-08 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a9c3e6b2d5f8'
down_revision: Union[str, Sequence[str], None] = 'f2a5d8b1e4c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('dashboards', sa.Column('share_token', sa.String(), nullable=True))
    op.create_index('ix_dashboards_share_token', 'dashboards', ['share_token'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_dashboards_share_token', table_name='dashboards')
    op.drop_column('dashboards', 'share_token')
