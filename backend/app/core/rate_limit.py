"""Login rate limiting — checked before a password is even verified (see
routes/auth.py). Backed by a real table (models/login_attempt.py), not
an in-memory counter, so it survives restarts and works correctly
whether this runs as one Railway container or many.

Two independent limits, deliberately set at different thresholds:
- Per email: a tight limit, since repeated failures against one specific
  account is the clearest signal of a targeted attack.
- Per IP address: a looser limit, since one IP failing logins across
  many different emails is credential-stuffing behavior, but a shared
  IP (an office, a NAT) failing occasional legitimate typos shouldn't
  lock everyone behind it out.

There is deliberately no cleanup job for old rows yet — this table will
grow unbounded over time. Fine at launch; worth a periodic DELETE FROM
login_attempts WHERE created_at < now() - interval '30 days' once this
has real traffic, not before.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from backend.app.models.login_attempt import LoginAttempt

EMAIL_LIMIT = 5
EMAIL_WINDOW_MINUTES = 15
IP_LIMIT = 20
IP_WINDOW_MINUTES = 15


def get_client_ip(request: Request) -> str | None:
    """Railway (like most PaaS platforms) sits behind a reverse proxy, so
    request.client.host would just be the proxy's own address — the
    actual client IP arrives via X-Forwarded-For instead. Falls back to
    request.client.host for local/direct-connection development.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def check_login_rate_limit(db: Session, email: str, ip_address: str | None) -> None:
    """Raises 429 if either limit is already exceeded. Call this BEFORE
    verifying the password — the point is to stop a brute-force attempt
    from getting to try more passwords, not just to log that it happened.
    """
    now = datetime.now(timezone.utc)

    email_window_start = now - timedelta(minutes=EMAIL_WINDOW_MINUTES)
    email_failures = (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.email == email,
            LoginAttempt.success.is_(False),
            LoginAttempt.created_at >= email_window_start,
        )
        .count()
    )
    if email_failures >= EMAIL_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts for this account. Try again in "
            f"{EMAIL_WINDOW_MINUTES} minutes, or reset your password.",
        )

    if ip_address:
        ip_window_start = now - timedelta(minutes=IP_WINDOW_MINUTES)
        ip_failures = (
            db.query(LoginAttempt)
            .filter(
                LoginAttempt.ip_address == ip_address,
                LoginAttempt.success.is_(False),
                LoginAttempt.created_at >= ip_window_start,
            )
            .count()
        )
        if ip_failures >= IP_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed login attempts from this network. Try again in "
                f"{IP_WINDOW_MINUTES} minutes.",
            )


def record_login_attempt(db: Session, email: str, ip_address: str | None, success: bool) -> None:
    db.add(LoginAttempt(email=email, ip_address=ip_address, success=success))
    db.commit()
