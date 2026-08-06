"""add field placeholder/help_text (appearance)

Revision ID: b3f7c1e9a4d6
Revises: a9c3e6b2d5f8
Create Date: 2026-08-05 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b3f7c1e9a4d6'
down_revision: Union[str, Sequence[str], None] = 'a9c3e6b2d5f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('field_definitions', sa.Column('placeholder', sa.String(), nullable=True))
    op.add_column('field_definitions', sa.Column('help_text', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('field_definitions', 'help_text')
    op.drop_column('field_definitions', 'placeholder')
