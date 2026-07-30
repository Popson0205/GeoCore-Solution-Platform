"""Role hierarchy for organisation membership (blueprint section 13: User
Roles and Permissions).

The `OrganisationMember.role` column already stored one of these values —
this module is what actually turns that column into enforced permissions.
Every project lives inside an organisation, so a single hierarchy here
covers both organisation-level and project-level checks.
"""

OWNER = "owner"
ADMINISTRATOR = "administrator"
PROJECT_MANAGER = "project_manager"
DATA_COLLECTOR = "data_collector"
ANALYST = "analyst"
VIEWER = "viewer"

ALL_ROLES = [OWNER, ADMINISTRATOR, PROJECT_MANAGER, DATA_COLLECTOR, ANALYST, VIEWER]

# Higher number = more privileged. Analyst and data_collector are kept at
# the same rank in the "can this role do X" sense used by has_min_role,
# because they're parallel specialisations (read/analyse vs. write data)
# rather than a strict ladder — but analyst is treated as read-only for
# write checks (see require_min_role call sites), so its numeric rank only
# matters relative to viewer.
_RANK = {
    VIEWER: 0,
    ANALYST: 1,
    DATA_COLLECTOR: 2,
    PROJECT_MANAGER: 3,
    ADMINISTRATOR: 4,
    OWNER: 5,
}


def has_min_role(role: str, minimum: str) -> bool:
    """True if `role` is at least as privileged as `minimum`."""
    return _RANK.get(role, -1) >= _RANK.get(minimum, 99)


def is_valid_role(role: str) -> bool:
    return role in ALL_ROLES
