#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
APP_DIR="/opt/rams-app/data-viewer-django-app"

echo "[deploy] Starting deploy for branch: $BRANCH"
cd "$APP_DIR"

echo "[deploy] Fetching latest commits..."
git fetch origin

echo "[deploy] Checking out $BRANCH..."
git checkout "$BRANCH"

echo "[deploy] Pulling from remote..."
git pull --ff-only origin "$BRANCH"

echo "[deploy] Building/updating containers (no hard downtime)..."
docker compose up -d --build

echo "[deploy] Collecting static..."
docker compose exec -T web python manage.py collectstatic --noinput

echo "[deploy] Reloading nginx..."
docker compose exec -T nginx nginx -s reload || docker compose restart nginx

echo "[deploy] Quick health check..."
curl -fsS http://localhost/ > /dev/null && echo "[deploy] OK: homepage reachable"
curl -fsS http://localhost/api/roads/?district=900DIK > /dev/null && echo "[deploy] OK: API reachable"

echo "[deploy] Done ✅"
