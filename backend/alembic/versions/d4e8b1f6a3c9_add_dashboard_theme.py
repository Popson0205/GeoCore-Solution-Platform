"""add dashboard theme column

Revision ID: d4e8b1f6a3c9
Revises: b1d9f4c7a2e8
Create Date: 2026-08-01 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd4e8b1f6a3c9'
down_revision: Union[str, Sequence[str], None] = 'b1d9f4c7a2e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable, no default — NULL means "use the default dark preset" (see
    # frontend/src/lib/dashboardThemes.js). Existing dashboards keep their
    # current look with zero migration work.
    op.add_column('dashboards', sa.Column('theme', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('dashboards', 'theme')
