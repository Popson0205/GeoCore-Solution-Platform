"""add dashboard time_filter column

Revision ID: c8d3f6a2b5e7
Revises: b7e2f5a1c9d4
Create Date: 2026-08-05 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c8d3f6a2b5e7'
down_revision: Union[str, Sequence[str], None] = 'b7e2f5a1c9d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('dashboards', sa.Column('time_filter', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('dashboards', 'time_filter')
