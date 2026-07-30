"""Pure-stdlib slug helper — deliberately has zero dependencies (not even
pydantic) so it can be imported from core logic (data_import.py,
dashboard_engine.py, etc.) without dragging in the schemas layer.
"""

import re


def slugify_key(label: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return key or "field"
