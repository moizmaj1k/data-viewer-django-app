#!/usr/bin/env bash
set -e

BRANCH=${1:-main}

echo "[deploy] Starting deploy for branch: $BRANCH"

cd /opt/rams-app/data-viewer-django-app

echo "[deploy] Fetching latest commits..."
git fetch origin

echo "[deploy] Checking out $BRANCH..."
git checkout "$BRANCH"

echo "[deploy] Pulling from remote..."
git pull origin "$BRANCH"

echo "[deploy] Rebuilding and restarting containers..."
docker compose down
docker compose up -d --build

echo "[deploy] Collecting static..."
docker compose exec web python manage.py collectstatic --noinput

echo "[deploy] Done."
