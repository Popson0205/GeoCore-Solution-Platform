"""Sends license-key emails via Resend. Used only by the Admin Portal
(routes/admin.py) — nothing customer-facing depends on this working.
Optional by design: if RESEND_API_KEY isn't configured, issuing a license
still succeeds, it just isn't auto-emailed (the Admin Portal shows the key
directly so your team can send it manually instead).
"""

import logging

import resend

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class EmailUnavailable(Exception):
    """Raised when RESEND_API_KEY isn't configured, or the send itself fails."""


def send_license_email(
    *,
    to_email: str,
    customer_name: str,
    license_key: str,
    plan: str,
    tier: str | None,
    seat_limit: int | None,
    duration_type: str,
    expires_at: str | None,
) -> None:
    if not settings.resend_api_key:
        raise EmailUnavailable("RESEND_API_KEY isn't configured on this deployment.")

    resend.api_key = settings.resend_api_key

    plan_line = f"{plan.capitalize()}" + (f" · {tier}" if tier else "")
    seats_line = "Unlimited seats" if seat_limit is None else f"{seat_limit} seat{'s' if seat_limit != 1 else ''}"
    duration_line = "Perpetual (no expiry)" if duration_type == "perpetual" else f"Yearly, renews/expires {expires_at}"

    html = f"""
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #058b8c;">Your GeoCore license</h2>
      <p>Hi {customer_name},</p>
      <p>Thanks for your purchase — here's your license key. Paste it into
      <strong>Organization &gt; Settings &gt; License</strong> in GeoCore to activate it.</p>
      <div style="background: #f4f4f4; border-radius: 6px; padding: 16px; margin: 20px 0; font-family: monospace; font-size: 12px; word-break: break-all;">
        {license_key}
      </div>
      <table style="font-size: 14px; color: #333;">
        <tr><td style="padding: 4px 12px 4px 0; color: #777;">Plan</td><td>{plan_line}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #777;">Seats</td><td>{seats_line}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #777;">Term</td><td>{duration_line}</td></tr>
      </table>
      <p style="margin-top: 24px; color: #777; font-size: 13px;">
        Keep this email — you'll need the key again if you ever need to re-apply it.
      </p>
    </div>
    """

    try:
        resend.Emails.send(
            {
                "from": settings.resend_from_email,
                "to": [to_email],
                "subject": "Your GeoCore license key",
                "html": html,
            }
        )
    except Exception as exc:  # noqa: BLE001 — any send failure degrades to "not sent", not a crash
        logger.warning("Failed to send license email to %s: %s", to_email, exc)
        raise EmailUnavailable(f"Email send failed: {exc}") from exc
