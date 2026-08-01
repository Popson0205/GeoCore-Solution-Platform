"""GeoCore licensing — offline-verifiable license keys.

Why asymmetric signing (Ed25519) instead of a shared-secret HMAC: an
on-prem customer has the entire deployed application, including whatever
key material ships inside it. If verification used a shared secret, that
secret would necessarily be present in every on-prem install, and a
sufficiently motivated customer could extract it and mint their own
"valid" licenses. With Ed25519, every deployment only ever contains the
PUBLIC key (safe to ship — it can only verify, never sign). The PRIVATE
signing key lives only on the vendor's side, never distributed, and is
used offline to issue a new license key after a customer pays their
invoice (see scripts/issue_license.py). This is also what makes on-prem/
air-gapped deployments work at all: a license can be verified with zero
network access, since everything needed to check it is baked into the
app itself.

A license key is: base64url(json_payload) + "." + base64url(signature).
The payload is deliberately small, human-inspectable JSON — a support
engineer can base64-decode the first segment by hand and read exactly
what a license grants without needing any tooling.
"""

import base64
import json
from datetime import date, datetime, timezone
from typing import Optional

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from backend.app.core.config import settings

PLANS = {"personal", "organization"}
# Tiers are only meaningful for the "organization" plan — a scalable,
# sector-agnostic ladder (no assumptions baked in about government vs NGO
# vs private vs military vs academic; a Tier is just a seat-limit/feature
# bucket a customer bought, named however sales wants to name it).
TIERS = {"basic", "pro", "enterprise", None}


class LicenseError(Exception):
    """Raised for any invalid, tampered, expired, or malformed license key."""


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def sign_license(
    *,
    licensee_name: str,
    plan: str,
    tier: Optional[str] = None,
    seat_limit: Optional[int],
    deployment_mode: str,
    expires_at: Optional[date],
    private_key: Ed25519PrivateKey,
) -> str:
    """Vendor-side only — needs the private key, which never ships in the
    app itself. See scripts/issue_license.py for the CLI that calls this
    after a manually-invoiced payment is confirmed.
    """
    if plan not in PLANS:
        raise ValueError(f"plan must be one of {sorted(PLANS)}")
    if tier not in TIERS:
        raise ValueError(f"tier must be one of {sorted(t for t in TIERS if t)}")
    if deployment_mode not in {"cloud", "on_prem"}:
        raise ValueError("deployment_mode must be 'cloud' or 'on_prem'")

    payload = {
        "licensee_name": licensee_name,
        "plan": plan,
        "tier": tier,
        "seat_limit": seat_limit,
        "deployment_mode": deployment_mode,
        "issued_at": datetime.now(timezone.utc).date().isoformat(),
        "expires_at": expires_at.isoformat() if expires_at else None,
    }
    payload_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    signature = private_key.sign(payload_bytes)
    return f"{_b64encode(payload_bytes)}.{_b64encode(signature)}"


def verify_license(license_key: str) -> dict:
    """Returns the decoded payload if the signature is valid and the
    license hasn't expired. Raises LicenseError otherwise — callers
    should treat any LicenseError as "this license doesn't grant
    anything" rather than trying to distinguish the reasons, since the
    remedy is the same either way (get a valid key from the vendor).
    """
    if not settings.license_public_key:
        raise LicenseError(
            "This deployment has no license public key configured — licensing can't be verified."
        )

    try:
        payload_b64, signature_b64 = license_key.strip().split(".")
        payload_bytes = _b64decode(payload_b64)
        signature = _b64decode(signature_b64)
    except Exception as exc:
        raise LicenseError(f"Malformed license key: {exc}") from exc

    public_key_bytes = _b64decode(settings.license_public_key)
    public_key = Ed25519PublicKey.from_public_bytes(public_key_bytes)

    try:
        public_key.verify(signature, payload_bytes)
    except InvalidSignature:
        raise LicenseError("License key signature is invalid — this key was not issued by GeoCore.")

    payload = json.loads(payload_bytes)

    if payload.get("expires_at"):
        expires = date.fromisoformat(payload["expires_at"])
        if expires < datetime.now(timezone.utc).date():
            raise LicenseError(f"This license expired on {expires.isoformat()}.")

    return payload


def default_seat_limit(plan: str) -> Optional[int]:
    """Applied when an organisation has no license key on file yet — a
    brand-new organisation is always on the personal-equivalent single
    seat until a real license is applied, regardless of which `plan` its
    creator picked at signup. This is what makes "manual invoice, license
    depends on what was purchased" actually enforced rather than
    advisory: picking "Organization" at signup doesn't grant extra seats
    by itself, applying a real license from the vendor does.
    """
    return 1
