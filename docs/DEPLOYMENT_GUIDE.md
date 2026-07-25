# Railway Deployment Guide

## Option A: GitHub deploy
1. Push the repository to GitHub.
2. Create a Railway project.
3. Connect the GitHub repository.
4. Railway builds from the root `Dockerfile` (Railway supports Dockerfile-based builds from a connected GitHub repo).
5. Add a PostgreSQL database service in the same Railway project.
6. Add environment variables to the app service: `DATABASE_URL` (from the Postgres service), `SECRET_KEY`, `CORS_ORIGINS`.
7. Use the generated Railway domain for testing or attach a custom domain.

## Option B: Local CLI deploy
Railway also supports deploying directly from your machine using the Railway CLI, which is useful for quick iteration before wiring up GitHub.

## Database
- Provision Railway's PostgreSQL plugin and copy its connection string into `DATABASE_URL` (in the `postgresql+psycopg2://...` form the backend expects).
- Tables are created automatically on app startup for this MVP stage. Once the schema stabilizes, switch to Alembic migrations.
- When spatial record tables are added (Phase 5 of the blueprint), run `CREATE EXTENSION IF NOT EXISTS postgis;` on the database once.

## Domain setup
- Use a Railway-provided domain for quick testing.
- Add a custom domain when the brand is ready.
- Railway supports automatic SSL for public services.

## Environment variables
Railway variables are available during both build and runtime, so secrets and configuration can be managed entirely in the Railway dashboard rather than committed to the repo.
