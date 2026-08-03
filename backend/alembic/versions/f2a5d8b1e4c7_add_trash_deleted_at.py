"""add deleted_at (trash) to surveys and dashboards

Revision ID: f2a5d8b1e4c7
Revises: e7f1b4d8c2a5
Create Date: 2026-08-07 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f2a5d8b1e4c7'
down_revision: Union[str, Sequence[str], None] = 'e7f1b4d8c2a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('surveys', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_surveys_deleted_at', 'surveys', ['deleted_at'])

    op.add_column('dashboards', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_dashboards_deleted_at', 'dashboards', ['deleted_at'])


def downgrade() -> None:
    op.drop_index('ix_dashboards_deleted_at', table_name='dashboards')
    op.drop_column('dashboards', 'deleted_at')

    op.drop_index('ix_surveys_deleted_at', table_name='surveys')
    op.drop_column('surveys', 'deleted_at')
