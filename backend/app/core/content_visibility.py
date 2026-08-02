"""Three-tier content-sharing visibility, shared across Survey/
FeatureLayer/Dashboard. Not to be confused with core/visibility.py,
which is a completely different concept (form-field skip logic).

- "organization" (the default, and the only tier that existed before
  this module did): every member of the organisation can see it.
- "private": only the item's creator can see it, plus anyone whose
  organisation role is Administrator or above (admins retain oversight
  of everything in their own org — a "private" item isn't private *from
  the people who run the organisation*, only from ordinary teammates).
- "public": view-only access via a share link, no login required. This
  module only decides *internal* (logged-in) visibility; the actual
  public link mechanism is the separate share_token flow on FeatureLayer
  (see routes/feature_layers.py) — an item can be "public" here and
  still require require_org_role() to actually edit it.

Only ADMINISTRATOR and OWNER count as "admin" here — Project Manager is
deliberately excluded, since Project Manager is about managing project
structure, not blanket visibility into every teammate's private items.
"""

from backend.app.core.roles import ADMINISTRATOR, has_min_role

VISIBILITY_TIERS = {"private", "organization", "public"}


def can_view(visibility: str, created_by, current_user_id, membership_role: str) -> bool:
    """`created_by` may be None (e.g. old rows from before this field
    existed, or system-created items) — treated as "no one specific
    owns this", so a private item with no creator on file falls back to
    admin-only rather than nobody-at-all.
    """
    if visibility != "private":
        return True
    if created_by is not None and str(created_by) == str(current_user_id):
        return True
    return has_min_role(membership_role, ADMINISTRATOR)
