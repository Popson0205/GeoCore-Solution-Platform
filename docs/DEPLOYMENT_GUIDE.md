# Railway Deployment Guide

## Option A: GitHub deploy
1. Push the repository to GitHub.
2. Create a Railway project.
3. Connect the GitHub repository.
4. Railway builds from the root `Dockerfile` (Railway supports Dockerfile-based builds from a connected GitHub repo).
5. Create a database with [Supabase](https://supabase.com) (see `SUPABASE_SETUP.md` for the exact steps and connection string format).
6. Add environment variables to the Railway app service: `DATABASE_URL` (the Supabase Session Pooler string — see below), `SECRET_KEY`, `CORS_ORIGINS`.
7. Use the generated Railway domain for testing or attach a custom domain.

## Option B: Local CLI deploy
Railway also supports deploying directly from your machine using the Railway CLI, which is useful for quick iteration before wiring up GitHub.

## Database
- Use Supabase for the database — see `SUPABASE_SETUP.md`. It includes PostGIS and avoids Railway's lack of reliable IPv6 egress (which breaks Supabase's plain "Direct connection" string).
- Use the **Session pooler** connection string (port 5432), not "Direct connection" — the direct string is IPv6-only. Change its scheme to `postgresql+psycopg2://` and append `?sslmode=require`.
- Tables are created automatically on app startup for this MVP stage. Once the schema stabilizes, switch to Alembic migrations.
- PostGIS is enabled from the Supabase dashboard (Database → Extensions) with one click, when spatial record tables are added (Phase 5 of the blueprint) — no server access needed.

## Domain setup
- Use a Railway-provided domain for quick testing.
- Add a custom domain when the brand is ready.
- Railway supports automatic SSL for public services.

## Environment variables
Railway variables are available during both build and runtime, so secrets and configuration can be managed entirely in the Railway dashboard rather than committed to the repo.
