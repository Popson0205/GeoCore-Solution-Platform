"""add organisation branding fields

Revision ID: f6a1d8e3c5b2
Revises: e5f9c2a7b1d4
Create Date: 2026-08-01 17:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f6a1d8e3c5b2'
down_revision: Union[str, Sequence[str], None] = 'e5f9c2a7b1d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('organisations', sa.Column('about_text', sa.Text(), nullable=True))
    op.add_column('organisations', sa.Column('website_url', sa.String(), nullable=True))
    op.add_column('organisations', sa.Column('open_data_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('organisations', 'open_data_url')
    op.drop_column('organisations', 'website_url')
    op.drop_column('organisations', 'about_text')
