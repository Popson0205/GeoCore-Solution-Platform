# Using Supabase as the GeoCore Database

Supabase is a hosted PostgreSQL service with PostGIS support built in, which
makes it a good fit for GeoCore once spatial records (Phase 5 of the
blueprint) are added — you won't need to install PostGIS yourself.

## 1. Create the project

1. Go to https://supabase.com and create a new project.
2. Choose a strong database password when prompted — you'll need it below.
3. Wait for provisioning to finish (a couple of minutes).

## 2. Get the connection string — use the Session Pooler, not "Direct connection"

In the Supabase dashboard: **Project Settings → Database → Connection string**.

Supabase offers three connection modes. This matters more than it looks:

| Mode | Port | IPv4? | Use for GeoCore? |
|---|---|---|---|
| Direct connection | 5432 | **No — IPv6 only** (unless you pay for the IPv4 add-on) | ❌ Will fail to connect from Railway |
| Session pooler | 5432 | Yes | ✅ Use this one |
| Transaction pooler (pgbouncer) | 6543 | Yes | Only for serverless/short-lived connections — not this app |

GeoCore's backend keeps a long-lived SQLAlchemy connection pool, which needs
full session-level Postgres support (prepared statements, etc.), so the
**Session pooler** is the correct choice — it's IPv4-reachable *and*
session-capable. The plain "Direct connection" string will silently fail to
connect from Railway (or most other PaaS containers) because it only
resolves over IPv6.

Copy the **Session pooler** URI. It looks like:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

## 3. Adapt it for this backend

Two changes are needed before it goes into `DATABASE_URL`:

1. Change the scheme from `postgresql://` to `postgresql+psycopg2://` (SQLAlchemy needs the driver named explicitly).
2. Append `?sslmode=require` (Supabase requires SSL).

Final form:

```
DATABASE_URL=postgresql+psycopg2://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

Set this as an environment variable on your Railway app service (not committed to the repo).

## 4. Enable PostGIS (needed later, for Phase 5 — spatial records)

Not required for the current auth/organisations/projects phase, but when you
get to spatial records:

1. Supabase dashboard → **Database → Extensions**.
2. Search for `postgis` and enable it.

That's it — no server access or `apt-get install` needed, unlike a bare Railway Postgres instance.

## 5. Verify

After setting `DATABASE_URL` and redeploying, check `/api/health` — if the
app's lifespan hook can reach the database, table creation will succeed
silently on startup. If it can't, the deploy log will show a
`psycopg2.OperationalError` at the same startup point, which almost always
means the connection string, password, or pooler mode is wrong.
