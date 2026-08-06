"""add field_definitions.appearance (select rendering style)

Revision ID: c4a8e2f6b9d3
Revises: b3f7c1e9a4d6
Create Date: 2026-08-07 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c4a8e2f6b9d3'
down_revision: Union[str, Sequence[str], None] = 'b3f7c1e9a4d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('field_definitions', sa.Column('appearance', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('field_definitions', 'appearance')
