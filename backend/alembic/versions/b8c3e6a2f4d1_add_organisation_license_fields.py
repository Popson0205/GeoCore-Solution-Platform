"""add organisation license fields

Revision ID: b8c3e6a2f4d1
Revises: a2b7f4e9c1d6
Create Date: 2026-08-01 22:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b8c3e6a2f4d1'
down_revision: Union[str, Sequence[str], None] = 'a2b7f4e9c1d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('organisations', sa.Column('license_key', sa.Text(), nullable=True))
    op.add_column('organisations', sa.Column('license_tier', sa.String(), nullable=True))
    op.add_column('organisations', sa.Column('seat_limit', sa.Integer(), nullable=True))
    op.add_column(
        'organisations',
        sa.Column('license_expires_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('organisations', 'license_expires_at')
    op.drop_column('organisations', 'seat_limit')
    op.drop_column('organisations', 'license_tier')
    op.drop_column('organisations', 'license_key')
