#!/usr/bin/env python3
"""Issue a signed GeoCore license key — run this yourself, after you've
confirmed a customer's manually-invoiced payment. This never talks to
the running app or its database; it's a pure offline signing tool, which
is exactly what lets it work for on-prem/air-gapped customers too — you
sign the key on your own machine and hand/email it to them, they paste
it into Organization settings, done.

Examples:
    # A personal-plan license, no expiry
    python backend/scripts/issue_license.py \\
        --private-key ./license_private_key.pem \\
        --licensee "Jane Doe" --plan personal

    # A 25-seat Organization/Pro license for a government client running
    # their own on-prem instance, valid for one year
    python backend/scripts/issue_license.py \\
        --private-key ./license_private_key.pem \\
        --licensee "Federal Ministry of X" --plan organization --tier pro \\
        --seats 25 --deployment on_prem --expires-in-days 365

    # An unlimited-seat enterprise license for a cloud customer
    python backend/scripts/issue_license.py \\
        --private-key ./license_private_key.pem \\
        --licensee "Sambus Geospatial Ltd" --plan organization --tier enterprise \\
        --seats unlimited --deployment cloud
"""
import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from cryptography.hazmat.primitives import serialization

from backend.app.core.licensing import sign_license  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--private-key", required=True, help="Path to your license_private_key.pem")
    parser.add_argument("--licensee", required=True, help="Customer / account name, for your own records")
    parser.add_argument("--plan", required=True, choices=["personal", "organization"])
    parser.add_argument("--tier", choices=["basic", "pro", "enterprise"], default=None)
    parser.add_argument(
        "--seats",
        default="1",
        help="Integer seat limit, or 'unlimited'. Ignored (forced to 1) for --plan personal.",
    )
    parser.add_argument("--deployment", choices=["cloud", "on_prem"], default="cloud")
    parser.add_argument(
        "--expires-in-days",
        type=int,
        default=None,
        help="Omit for a perpetual license (no expiry).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    private_pem = Path(args.private_key).read_text()
    private_key = serialization.load_pem_private_key(private_pem.encode("ascii"), password=None)

    if args.plan == "personal":
        seat_limit = 1
    elif args.seats.lower() == "unlimited":
        seat_limit = None
    else:
        seat_limit = int(args.seats)

    expires_at = date.today() + timedelta(days=args.expires_in_days) if args.expires_in_days else None

    key = sign_license(
        licensee_name=args.licensee,
        plan=args.plan,
        tier=args.tier,
        seat_limit=seat_limit,
        deployment_mode=args.deployment,
        expires_at=expires_at,
        private_key=private_key,
    )

    print("License key (send this to the customer to paste into Organization settings):")
    print()
    print(key)
    print()
    print(f"Licensee: {args.licensee}")
    print(f"Plan: {args.plan}" + (f" ({args.tier})" if args.tier else ""))
    print(f"Seats: {'unlimited' if seat_limit is None else seat_limit}")
    print(f"Deployment: {args.deployment}")
    print(f"Expires: {expires_at.isoformat() if expires_at else 'never'}")


if __name__ == "__main__":
    main()
