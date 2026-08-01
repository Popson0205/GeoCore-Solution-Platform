"""flatten data model: Survey owns the form, retire AssetType

Revision ID: b1d9f4c7a2e8
Revises: f2a7c4e19b3d
Create Date: 2026-08-01 00:00:00.000000

GeoCore Portal redesign — flat Survey123/KoBo data model.

This collapses the old three-layer Survey -> AssetType -> form hierarchy
into a flat one where the Survey *is* the form: FormSections and
FieldDefinitions hang directly off a Survey, and the Survey carries the
geometry_type/color that used to live on its AssetType "feature layer".
After this migration the `asset_types` table is gone entirely.

Fan-out reasoning (mirrors 949438a09110's one-Survey-per-AssetType
backfill, applied here in the opposite direction):

  - Migration 949438 created exactly one Survey per AssetType, so most
    Surveys still own a single AssetType. For those, the collapse is a
    straight 1:1 merge: copy that AssetType's geometry_type/color up onto
    the Survey and re-point its sections/fields at the Survey.

  - But the redesigned app let users add extra AssetTypes under a single
    Survey (Survey.asset_types was a one-to-many). A Survey with N
    AssetTypes can't become one flat form without losing N-1 of them, so
    we FAN OUT: the earliest-created AssetType stays on the original
    Survey, and every extra AssetType gets its OWN brand-new Survey
    (cloned from the parent's organisation/project/status/submission
    settings, its title suffixed with the AssetType name). That extra
    AssetType's sections, fields, and any Records that referenced it are
    re-pointed at the new Survey. Net effect: one Survey per former
    AssetType — exactly the flat model — with zero data loss.

    The cloned Surveys deliberately get submission_token = NULL:
    submission_token is UNIQUE, so the parent's token can't be duplicated
    onto them. A fresh submission link can be minted per new Survey later.

Uses ad hoc table() definitions rather than the ORM models, so it keeps
working exactly as written even after the models change further.
"""
from typing import Sequence, Union
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1d9f4c7a2e8'
down_revision: Union[str, Sequence[str], None] = 'f2a7c4e19b3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


asset_types = sa.table(
    'asset_types',
    sa.column('id', sa.UUID()),
    sa.column('survey_id', sa.UUID()),
    sa.column('name', sa.String()),
    sa.column('description', sa.Text()),
    sa.column('geometry_type', sa.String()),
    sa.column('color', sa.String()),
    sa.column('created_at', sa.DateTime(timezone=True)),
)

surveys = sa.table(
    'surveys',
    sa.column('id', sa.UUID()),
    sa.column('organisation_id', sa.UUID()),
    sa.column('project_id', sa.UUID()),
    sa.column('title', sa.String()),
    sa.column('description', sa.Text()),
    sa.column('status', sa.String()),
    sa.column('submission_token', sa.String()),
    sa.column('submission_enabled', sa.Boolean()),
    sa.column('submission_access', sa.String()),
    sa.column('geometry_type', sa.String()),
    sa.column('color', sa.String()),
    sa.column('created_at', sa.DateTime(timezone=True)),
)

form_sections = sa.table(
    'form_sections',
    sa.column('id', sa.UUID()),
    sa.column('asset_type_id', sa.UUID()),
    sa.column('survey_id', sa.UUID()),
)

field_definitions = sa.table(
    'field_definitions',
    sa.column('id', sa.UUID()),
    sa.column('asset_type_id', sa.UUID()),
    sa.column('survey_id', sa.UUID()),
)

records = sa.table(
    'records',
    sa.column('id', sa.UUID()),
    sa.column('asset_type_id', sa.UUID()),
    sa.column('survey_id', sa.UUID()),
)


def _sort_key(row):
    # Earliest-created AssetType is the "primary" that keeps the original
    # Survey; the rest fan out. Fall back to id for a stable order when
    # created_at is missing or tied.
    return (row.created_at or datetime(1970, 1, 1, tzinfo=timezone.utc), str(row.id))


def _repoint(bind, asset_type_id, survey_id) -> None:
    """Point one AssetType's sections, fields, and records at `survey_id`."""
    bind.execute(
        form_sections.update()
        .where(form_sections.c.asset_type_id == asset_type_id)
        .values(survey_id=survey_id)
    )
    bind.execute(
        field_definitions.update()
        .where(field_definitions.c.asset_type_id == asset_type_id)
        .values(survey_id=survey_id)
    )
    bind.execute(
        records.update()
        .where(records.c.asset_type_id == asset_type_id)
        .values(survey_id=survey_id)
    )


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    # --- 1. new columns (added first so the backfill has somewhere to write) ---
    # server_default keeps existing rows valid the instant the column lands;
    # it's dropped again at the end so the live schema matches the ORM model
    # (which only carries a Python-side default).
    op.add_column(
        'surveys', sa.Column('geometry_type', sa.String(), nullable=False, server_default='point')
    )
    op.add_column(
        'surveys', sa.Column('color', sa.String(), nullable=False, server_default='#2563eb')
    )
    op.add_column('form_sections', sa.Column('survey_id', sa.UUID(), nullable=True))
    op.add_column('field_definitions', sa.Column('survey_id', sa.UUID(), nullable=True))

    # --- 2. data fan-out: one flat Survey per former AssetType ---
    at_rows = bind.execute(
        sa.select(
            asset_types.c.id,
            asset_types.c.survey_id,
            asset_types.c.name,
            asset_types.c.description,
            asset_types.c.geometry_type,
            asset_types.c.color,
            asset_types.c.created_at,
        )
    ).fetchall()

    by_survey: dict = defaultdict(list)
    for row in at_rows:
        by_survey[row.survey_id].append(row)

    for survey_id, asset_type_group in by_survey.items():
        ordered = sorted(asset_type_group, key=_sort_key)
        primary = ordered[0]

        # The primary AssetType merges straight into its existing Survey.
        bind.execute(
            surveys.update()
            .where(surveys.c.id == survey_id)
            .values(geometry_type=primary.geometry_type, color=primary.color)
        )
        _repoint(bind, primary.id, survey_id)

        if len(ordered) == 1:
            continue

        # Every extra AssetType fans out into a fresh Survey cloned from the
        # parent. Fetch the parent's cloneable fields once.
        parent = bind.execute(
            sa.select(
                surveys.c.organisation_id,
                surveys.c.project_id,
                surveys.c.title,
                surveys.c.description,
                surveys.c.status,
                surveys.c.submission_enabled,
                surveys.c.submission_access,
            ).where(surveys.c.id == survey_id)
        ).first()
        if parent is None:
            continue

        for extra in ordered[1:]:
            new_survey_id = uuid.uuid4()
            bind.execute(
                surveys.insert().values(
                    id=new_survey_id,
                    organisation_id=parent.organisation_id,
                    project_id=parent.project_id,
                    title=f"{parent.title} - {extra.name}",
                    # The fanned-out form's own description if it had one,
                    # otherwise inherit the parent Survey's.
                    description=extra.description if extra.description is not None else parent.description,
                    status=parent.status,
                    # UNIQUE column — the parent's token can't be duplicated
                    # onto the clone; a new link can be minted later.
                    submission_token=None,
                    submission_enabled=parent.submission_enabled,
                    submission_access=parent.submission_access,
                    geometry_type=extra.geometry_type,
                    color=extra.color,
                    created_at=extra.created_at or datetime.now(timezone.utc),
                )
            )
            _repoint(bind, extra.id, new_survey_id)

    # --- 3. lock the new survey_id FKs now that every row is backfilled ---
    op.alter_column('form_sections', 'survey_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('field_definitions', 'survey_id', existing_type=sa.UUID(), nullable=False)
    op.create_foreign_key(
        'fk_form_sections_survey_id_surveys', 'form_sections', 'surveys', ['survey_id'], ['id']
    )
    op.create_foreign_key(
        'fk_field_definitions_survey_id_surveys', 'field_definitions', 'surveys', ['survey_id'], ['id']
    )

    # --- 4. drop the retired AssetType layer ---
    op.drop_constraint('records_asset_type_id_fkey', 'records', type_='foreignkey')
    op.drop_column('records', 'asset_type_id')

    op.drop_constraint('field_definitions_asset_type_id_fkey', 'field_definitions', type_='foreignkey')
    op.drop_column('field_definitions', 'asset_type_id')

    op.drop_constraint('form_sections_asset_type_id_fkey', 'form_sections', type_='foreignkey')
    op.drop_column('form_sections', 'asset_type_id')

    op.drop_index(op.f('ix_asset_types_survey_id'), table_name='asset_types')
    op.drop_table('asset_types')

    # --- 5. drop the transitional server_defaults (the ORM owns the default) ---
    op.alter_column('surveys', 'geometry_type', server_default=None)
    op.alter_column('surveys', 'color', server_default=None)


def downgrade() -> None:
    """Downgrade schema.

    Schema-only reversal (same policy as 949438a09110): the fanned-out
    Surveys and the survey_id backfill are left in place — undoing them
    would orphan any sections/fields/records created after this ran. The
    `asset_types` table is recreated empty; its rows were merged up into
    Surveys and can't be reconstructed, so every restored asset_type_id
    column comes back NULL for the same reason.
    """
    op.create_table(
        'asset_types',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('survey_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('geometry_type', sa.String(), nullable=False),
        sa.Column('color', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['survey_id'], ['surveys.id'], name='fk_asset_types_survey_id_surveys'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_asset_types_survey_id'), 'asset_types', ['survey_id'], unique=False)

    op.add_column('form_sections', sa.Column('asset_type_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'form_sections_asset_type_id_fkey', 'form_sections', 'asset_types', ['asset_type_id'], ['id']
    )
    op.drop_constraint('fk_form_sections_survey_id_surveys', 'form_sections', type_='foreignkey')
    op.drop_column('form_sections', 'survey_id')

    op.add_column('field_definitions', sa.Column('asset_type_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'field_definitions_asset_type_id_fkey', 'field_definitions', 'asset_types', ['asset_type_id'], ['id']
    )
    op.drop_constraint('fk_field_definitions_survey_id_surveys', 'field_definitions', type_='foreignkey')
    op.drop_column('field_definitions', 'survey_id')

    op.add_column('records', sa.Column('asset_type_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'records_asset_type_id_fkey', 'records', 'asset_types', ['asset_type_id'], ['id']
    )

    op.drop_column('surveys', 'color')
    op.drop_column('surveys', 'geometry_type')

