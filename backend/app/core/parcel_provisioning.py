"""GeoCore Estate is a different kind of solution from the rest of the
platform: a parcel isn't a survey response someone fills out a form for
— it's drawn or COGO-plotted directly. There's no reason an org should
have to go build a form in the Survey Designer first just to start
recording parcels.

Every Record still needs a survey_id/feature_layer_id underneath (see
models/record.py — this is the platform's one generic spatial-data
model, "build once, configure many times" per the GeoCore blueprint),
so this silently provisions one dedicated Survey+FeatureLayer per
organisation, tagged specifically for GeoCore Estate, the first time
that org actually needs one. The org never sees the Survey Designer or
even knows this exists — routes/parcels.py's create-parcel endpoint is
the only caller.
"""

from sqlalchemy.orm import Session

from backend.app.models.feature_layer import FeatureLayer
from backend.app.models.survey import Survey

# A fixed, recognizable title — how get_or_create_estate_layer finds an
# already-provisioned layer again, and how a human skimming the org's
# Content list would recognize what it's for if they ever do see it.
ESTATE_SURVEY_TITLE = "GeoCore Estate Parcels"


def get_or_create_estate_layer(db: Session, organisation_id, user_id) -> FeatureLayer:
    existing = (
        db.query(FeatureLayer)
        .join(Survey, FeatureLayer.survey_id == Survey.id)
        .filter(FeatureLayer.organisation_id == organisation_id, Survey.title == ESTATE_SURVEY_TITLE)
        .first()
    )
    if existing:
        return existing

    survey = Survey(
        organisation_id=organisation_id,
        title=ESTATE_SURVEY_TITLE,
        description="Auto-created by GeoCore Estate — parcels are drawn/COGO-plotted directly, not collected through a form.",
        geometry_type="polygon",
        color="#b7791f",  # GeoCore Estate's own accent colour
        status="published",
        created_by=user_id,
    )
    db.add(survey)
    db.flush()

    layer = FeatureLayer(
        organisation_id=organisation_id,
        survey_id=survey.id,
        name=ESTATE_SURVEY_TITLE,
        geometry_type="polygon",
        color="#b7791f",
    )
    db.add(layer)
    db.flush()
    return layer
