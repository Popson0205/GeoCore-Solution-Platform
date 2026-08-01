"""add organisation plan column

Revision ID: a2b7f4e9c1d6
Revises: f6a1d8e3c5b2
Create Date: 2026-08-01 21:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a2b7f4e9c1d6'
down_revision: Union[str, Sequence[str], None] = 'f6a1d8e3c5b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default keeps every existing organisation on the
    # "organization" tier (full member management) — nobody's current
    # invite ability silently disappears when this ships.
    op.add_column(
        'organisations',
        sa.Column('plan', sa.String(), nullable=False, server_default='organization'),
    )


def downgrade() -> None:
    op.drop_column('organisations', 'plan')
