"""create survey_assignments table (per-survey Data Collector RBAC)

Revision ID: f2a7c4e19b3d
Revises: c3f6a1b9d4e2
Create Date: 2026-07-31 00:00:00.000000

GeoCore Portal redesign — Phase 9 of the 10-phase implementation plan.
Adds `SurveyAssignment(survey_id, user_id)`: optional scoping of a Data
Collector's write access to specific Surveys. No existing table is
touched — this is purely additive, so applying it changes nothing until
rows are actually inserted (see deps_project.require_survey_role for the
enforcement logic).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2a7c4e19b3d'
down_revision: Union[str, Sequence[str], None] = 'c3f6a1b9d4e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'survey_assignments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('survey_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['survey_id'], ['surveys.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('survey_id', 'user_id', name='uq_survey_assignment_survey_user'),
    )
    op.create_index(
        op.f('ix_survey_assignments_survey_id'), 'survey_assignments', ['survey_id'], unique=False
    )
    op.create_index(
        op.f('ix_survey_assignments_user_id'), 'survey_assignments', ['user_id'], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_survey_assignments_user_id'), table_name='survey_assignments')
    op.drop_index(op.f('ix_survey_assignments_survey_id'), table_name='survey_assignments')
    op.drop_table('survey_assignments')
