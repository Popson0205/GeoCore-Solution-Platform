"""add report ai_summary column

Revision ID: e5f9c2a7b1d4
Revises: d4e8b1f6a3c9
Create Date: 2026-08-01 16:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e5f9c2a7b1d4'
down_revision: Union[str, Sequence[str], None] = 'd4e8b1f6a3c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('reports', sa.Column('ai_summary', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('reports', 'ai_summary')
