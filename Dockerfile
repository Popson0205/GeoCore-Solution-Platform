# syntax=docker/dockerfile:1

FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend ./
RUN npm run build

FROM python:3.11-slim AS backend
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends         build-essential         && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY alembic.ini ./alembic.ini
COPY backend ./backend
COPY --from=frontend-build /app/frontend/dist ./backend/app/static

EXPOSE 8000
# Apply any pending Alembic migrations before the app starts, so a deploy
# can never leave the live schema behind the code it's about to serve (this
# was previously a manual, easy-to-forget step — alembic.ini wasn't even
# copied into the image, so it couldn't be run against the deployed
# container at all). If the migration fails, the container fails to start
# rather than serving requests against a stale/broken schema.
CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
