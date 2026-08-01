#!/usr/bin/env python3
"""Generate the Ed25519 keypair GeoCore's licensing system is built on.

Run this ONCE, ever (per distinct vendor identity — you don't need a new
keypair per customer or per deployment). Keep private_key.pem somewhere
that never leaves your control and is never committed to source control
or shipped in any deployment artifact — treat it like the signing key it
is. public_key.b64 is safe to share/commit/bake into every deployment
(cloud and on-prem alike): it can only verify licenses, never mint them.

Usage:
    python backend/scripts/generate_license_keypair.py

Then:
    - Keep private_key.pem private, e.g. in your password manager or a
      secrets vault. Point scripts/issue_license.py at it via
      --private-key or the GEOCORE_LICENSE_PRIVATE_KEY env var.
    - Set the printed public key as: LICENSE_PUBLIC_KEY=<value> in every
      deployment's .env (cloud and on-prem alike).
"""
import base64
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def main() -> None:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    out_dir.mkdir(parents=True, exist_ok=True)

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_raw = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    public_b64 = base64.urlsafe_b64encode(public_raw).decode("ascii").rstrip("=")

    private_path = out_dir / "license_private_key.pem"
    private_path.write_text(private_pem.decode("ascii"))
    private_path.chmod(0o600)

    print(f"Private key written to: {private_path}  (keep this OUT of source control)")
    print()
    print("Public key (safe to share / commit / put in every deployment's .env):")
    print(public_b64)
    print()
    print("Set this in every deployment's environment as:")
    print(f"  LICENSE_PUBLIC_KEY={public_b64}")


if __name__ == "__main__":
    main()
