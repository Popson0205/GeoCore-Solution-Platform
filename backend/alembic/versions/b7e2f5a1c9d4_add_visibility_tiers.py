"""add three-tier visibility (private/organization/public)

Revision ID: b7e2f5a1c9d4
Revises: a4f7c2e9b6d3
Create Date: 2026-08-04 09:00:00.000000

Replaces FeatureLayer's plain share_enabled boolean with a real third
state: a Survey/FeatureLayer/Dashboard can now be "private" (only its
creator, plus Administrator+), not just "organization-wide or public".
See core/visibility.py for the shared enforcement helper.

FeatureLayer rows that already had share_enabled=true become
visibility="public" (their share_token is preserved, so existing public
links keep working); everything else becomes "organization", matching
today's actual behavior for every Survey/Dashboard already in the
database (nothing was private before this existed).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b7e2f5a1c9d4'
down_revision: Union[str, Sequence[str], None] = 'a4f7c2e9b6d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'surveys', sa.Column('visibility', sa.String(), nullable=False, server_default='organization')
    )

    op.add_column(
        'feature_layers',
        sa.Column('visibility', sa.String(), nullable=False, server_default='organization'),
    )
    op.execute("UPDATE feature_layers SET visibility = 'public' WHERE share_enabled IS TRUE")
    op.drop_column('feature_layers', 'share_enabled')

    op.add_column(
        'dashboards',
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
    )
    op.add_column(
        'dashboards', sa.Column('visibility', sa.String(), nullable=False, server_default='organization')
    )


def downgrade() -> None:
    op.drop_column('dashboards', 'visibility')
    op.drop_column('dashboards', 'created_by')

    op.add_column('feature_layers', sa.Column('share_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.execute("UPDATE feature_layers SET share_enabled = true WHERE visibility = 'public'")
    op.drop_column('feature_layers', 'visibility')

    op.drop_column('surveys', 'visibility')
