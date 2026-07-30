"""backfill: record.survey_id / record.organisation_id

Revision ID: 90a27c2abfe2
Revises: 949438a09110
Create Date: 2026-07-30 11:05:00.000000

GeoCore Portal redesign — Phase 4 of the 10-phase implementation plan,
migration 3 of 3.

Pure data backfill: populates the `survey_id` / `organisation_id` columns
added to `records` in the Phase 3 migration (de35016a2782), for every
existing record, via its asset type's survey (Migration 2 just backfilled
that one-to-one). Indexes on these columns were already created alongside
the columns themselves in the Phase 3 migration — nothing further to index
here.

A record whose asset type didn't get a survey in Migration 2 (orphaned
project pre-redesign, see that migration's skip case) is left with a NULL
survey_id/organisation_id; Migration 4's NOT NULL flip will fail loudly on
any such row rather than silently corrupting it, which is the correct
failure mode — that data needs a human decision, not a script's guess.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '90a27c2abfe2'
down_revision: Union[str, Sequence[str], None] = '949438a09110'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        """
        UPDATE records
        SET survey_id = asset_types.survey_id,
            organisation_id = surveys.organisation_id
        FROM asset_types
        JOIN surveys ON surveys.id = asset_types.survey_id
        WHERE records.asset_type_id = asset_types.id
          AND asset_types.survey_id IS NOT NULL
        """
    )


def downgrade() -> None:
    """Downgrade schema.

    Data-only migration — reversing it clears the columns back to NULL,
    matching the added-but-unfilled state right after the Phase 3 migration.
    """
    op.execute("UPDATE records SET survey_id = NULL, organisation_id = NULL")

