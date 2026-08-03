"""GeoAI — turns a report's underlying data (survey structure, dashboard
widgets and their live computed values, and summary stats) into a written
narrative, instead of a report being just raw counts. This is genuinely
optional: without a GEMINI_API_KEY configured (see core/config.py),
`generate_narrative` returns None and report generation proceeds exactly
as it did before GeoAI existed — nothing else depends on this succeeding.

Uses Google's Gemini API (free tier: no credit card, ~1,500 requests/day
on the default model as of this writing) rather than a paid provider —
this feature doesn't need frontier-tier quality, and it's triggered
per-report rather than per-request, so the free tier's daily cap is not
a realistic constraint here.

This module has no database access of its own on purpose — the caller
(routes/reports.py) assembles the context dict from data it already has
authorization to read, and this module's only job is turning that context
into a prompt and asking the model for prose back. Keeping the boundary
here means core/geoai.py can be tested/reasoned about without a DB at all.
"""

import logging

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class GeoAIUnavailable(Exception):
    """Raised when a narrative was requested but no API key is configured,
    so the caller can show a clear message instead of a silent no-op.
    """


def _describe_survey(survey: dict) -> str:
    field_lines = "\n".join(
        f"    - {f['label']} ({f['field_type']})" for f in survey.get("fields", [])
    ) or "    (no fields defined yet)"
    return (
        f"- \"{survey['title']}\" — {survey.get('description') or 'no description'}\n"
        f"  Geometry: {survey['geometry_type']}. Records collected so far: {survey['record_count']}.\n"
        f"  Fields:\n{field_lines}"
    )


def _describe_widget(widget: dict) -> str:
    data = widget.get("data") or {}
    preview = {k: v for k, v in data.items() if k not in ("error",)}
    return f"  - [{widget['widget_type']}] \"{widget['title']}\": {preview}"


def _build_prompt(context: dict) -> str:
    surveys_block = "\n".join(_describe_survey(s) for s in context.get("surveys", [])) or "(none)"

    dashboards_block = ""
    for dash in context.get("dashboards", []):
        widget_lines = "\n".join(_describe_widget(w) for w in dash.get("widgets", [])) or "  (no elements yet)"
        dashboards_block += f"\nDashboard \"{dash['name']}\":\n{widget_lines}\n"
    dashboards_block = dashboards_block or "(no dashboards yet)"

    summary = context.get("summary", {})

    return f"""You are writing the narrative section of a geospatial data-collection report for
"{context.get('organisation_name', 'this organisation')}". Explain what the data actually shows —
don't just restate the numbers below, interpret them: notable patterns, gaps, anything a
non-technical stakeholder should know, and what it suggests about the state of the work being
tracked. Be specific and reference the actual survey/field/dashboard names given. Write 3-5 short
paragraphs of plain prose (no headers, no bullet lists, no markdown) suitable for pasting directly
into a PDF report. If there isn't enough data yet to say much, say that plainly and suggest what
to collect next, rather than padding with generic filler.

Organisation-wide totals: {summary.get('survey_count', 0)} surveys, {summary.get('record_count', 0)}
records, {summary.get('attachment_count', 0)} attachments.

Surveys (each one is a self-contained data-collection form; geometry is what's mapped per record):
{surveys_block}

Dashboards and their current chart/indicator values:
{dashboards_block}
"""


def generate_narrative(context: dict) -> str:
    """Returns a plain-prose narrative, or raises GeoAIUnavailable if no
    API key is configured, or if the request itself fails for any reason
    — callers have one exception type to handle either way, and report
    generation should never hard-fail just because the narrative couldn't
    be produced this time.
    """
    if not settings.gemini_api_key:
        raise GeoAIUnavailable("No GEMINI_API_KEY configured for this deployment.")

    try:
        from google import genai
        from google.genai.types import GenerateContentConfig

        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=_build_prompt(context),
            config=GenerateContentConfig(max_output_tokens=1200),
        )
        text = response.text
        if not text:
            raise GeoAIUnavailable("Gemini returned an empty response.")
        return text.strip()
    except GeoAIUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001 — deliberately broad: any failure here degrades gracefully
        logger.warning("GeoAI narrative generation failed: %s", exc)
        raise GeoAIUnavailable(f"GeoAI request failed: {exc}") from exc
