"""add organisations.estate_public_search_enabled

Revision ID: a3d7e5f9c2b1
Revises: f1a6c8e3b5d9
Create Date: 2026-08-08 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a3d7e5f9c2b1'
down_revision: Union[str, Sequence[str], None] = 'f1a6c8e3b5d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'organisations',
        sa.Column('estate_public_search_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('organisations', 'estate_public_search_enabled')
