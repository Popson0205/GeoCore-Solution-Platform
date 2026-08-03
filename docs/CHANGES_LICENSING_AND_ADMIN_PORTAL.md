# Licensing & the Admin Portal

# Licensing & the Admin Portal

## Deployment: the Admin Portal is a separate repo and a separate service

The Admin Portal now lives in its own repository —
[GeoCore-Admin-Portal](https://github.com/Popson0205/GeoCore-Admin-Portal) —
deployed as a genuinely separate service from the customer-facing
platform (this repo), not just a hidden route or a second Dockerfile in
the same codebase. It shares the same database (same
`DATABASE_URL`/`DB_HOST`/etc — both read/write the same
Customers/Licenses/Organisations tables) but contains none of the
customer-facing code at all.

To deploy it (e.g. on Railway): create a service pointed at the
`GeoCore-Admin-Portal` repo directly — its own `Dockerfile` needs no
special path configuration. Set the same `DATABASE_URL` (and JWT/
`SECRET_KEY`) as this platform's service so logins and data line up —
this is the one setting that must match exactly between the two. Only
this platform's deployment runs `alembic upgrade head` on startup; the
admin repo's deployment does not, so redeploy this one first after a
migration, then the admin service.

## One-time setup (do this once, ever)

1. Generate your vendor keypair:
   ```
   python backend/scripts/generate_license_keypair.py ./secrets
   ```
   This writes `secrets/license_private_key.pem` and prints a public key.
   **Never commit or deploy the private key file.** Keep it in a password
   manager or secrets vault.

2. Set the public key on **every** deployment (cloud and on-prem alike) —
   this is safe to share, it can only verify licenses, never mint them:
   ```
   LICENSE_PUBLIC_KEY=<the printed value>
   ```

3. Set the private key **only** on the Admin Portal's own deployment
   (never on the main platform, and never on a customer deployment):
   ```
   LICENSE_PRIVATE_KEY="$(cat secrets/license_private_key.pem)"
   ```
   Without this set, the Admin Portal's license-issuing endpoint 503s —
   there's nothing to abuse even if someone reaches the route.

4. Promote your own account to `is_platform_admin` directly in the
   database (there is no API or UI path to do this — by design):
   ```sql
   UPDATE users SET is_platform_admin = true WHERE email = 'you@geocore.example';
   ```

5. (Optional) Set up email delivery on the Admin Portal's deployment:
   ```
   RESEND_API_KEY=re_xxx
   RESEND_FROM_EMAIL=licensing@yourdomain.com
   ```
   Without this, issuing a license still works — the Admin Portal shows
   you the key to copy and send manually instead.

## Day-to-day: issuing a license after a manually-invoiced payment

1. Go to the Admin Portal's own domain (a completely separate URL from
   the main platform — bookmark it, since there's no link to it from
   anywhere in the customer-facing product on purpose).
2. Create the customer if they're new (gets an auto-assigned number like
   `GC-000042`).
3. Open the customer, fill in the "Issue a license" form: plan, tier,
   seats, Yearly vs. Perpetual, Cloud vs. On-prem.
4. Submit. If Resend is configured, the customer gets emailed
   automatically; either way, the key is shown on screen too.
5. The customer pastes the key into **Organization -> Settings -> License**
   in their GeoCore instance. Verification is fully offline — works
   identically for cloud and air-gapped on-prem.

## Revoking a license

Click "Revoke" next to any license in the customer's history. This:
- Blocks that key from being applied (or re-applied) to any **cloud**
  organisation going forward.
- Does **not** retroactively deactivate a copy already applied to an
  **on-prem** instance with no network path back to you — there is no
  way to force that remotely with an offline-verifiable license. If a
  customer's on-prem license needs to stop working immediately (e.g. a
  contract dispute), that has to be a support/contractual conversation,
  not a technical kill-switch.

## What "Personal" vs "Organization" actually enforce

- A brand-new Organisation always defaults to a 1-seat limit, regardless
  of which plan was picked at signup — picking "Organization" doesn't
  grant extra seats by itself. Only applying a real license does.
- `personal` plan orgs can never invite anyone (enforced server-side in
  `POST /organisations/{id}/members`, not just hidden in the UI).
- Seat limits are enforced the same way, on the same endpoint.
