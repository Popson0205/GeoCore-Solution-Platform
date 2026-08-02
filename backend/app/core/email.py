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


def send_purchase_request_notification(
    *,
    customer_number: str,
    name: str,
    email: str,
    phone: str | None,
    organisation_name: str,
    plan: str,
    tier: str | None,
    seats: str,
    desired_domain: str | None,
    message: str | None,
) -> None:
    """Notifies your sales/ops inbox that someone submitted the public
    purchase form — separate from send_license_email, which goes the
    other direction (you -> customer) once a license is actually issued.
    A failure here is logged and swallowed, never raised: a lead that
    fails to email you is still sitting safely in the Admin Portal's
    customer list either way, so this can't be the reason a request gets
    lost.
    """
    if not settings.resend_api_key or not settings.sales_notification_email:
        return

    resend.api_key = settings.resend_api_key

    rows = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:#777;">{label}</td><td>{value}</td></tr>'
        for label, value in [
            ("Customer #", customer_number),
            ("Name", name),
            ("Email", email),
            ("Phone", phone or "—"),
            ("Organisation", organisation_name),
            ("Plan", f"{plan}{f' ({tier})' if tier else ''}"),
            ("Seats requested", seats),
            ("Desired domain", desired_domain or "—"),
        ]
    )
    html = f"""
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #058b8c;">New license purchase request</h2>
      <table style="font-size: 14px; color: #333;">{rows}</table>
      {f'<p><strong>Message:</strong> {message}</p>' if message else ''}
      <p style="margin-top: 20px; color: #777; font-size: 13px;">
        Confirm payment, then issue their license from the Admin Portal.
      </p>
    </div>
    """
    try:
        resend.Emails.send(
            {
                "from": settings.resend_from_email,
                "to": [settings.sales_notification_email],
                "subject": f"New license purchase request — {organisation_name}",
                "html": html,
            }
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to send purchase-request notification: %s", exc)


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
