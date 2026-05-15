#!/usr/bin/env bash
# Hot-update Ola_devboard on box4 (Ola/#225-E). Idempotent — same commit
# twice is a no-op aside from a restart. Pulls origin/main with fast-forward
# only (refuses to reset prod-side commits — investigate manually first).
#
# Run on box4:
#   bash /opt/Ola_devboard/scripts/hot_update.sh

set -eu

ROOT=/opt/Ola_devboard
cd "$ROOT"

echo "=== hot_update: start (PWD=$ROOT) ==="

OLD_REV=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
echo "[hot_update] HEAD before pull: $OLD_REV"

git fetch origin main
git pull --ff-only origin main
NEW_REV=$(git rev-parse --short HEAD)
echo "[hot_update] HEAD after pull:  $NEW_REV"

echo "[hot_update] backend npm ci..."
(cd backend && npm ci --no-audit --no-fund)

echo "[hot_update] frontend npm ci + build..."
(cd frontend && npm ci --no-audit --no-fund && npm run build)

echo "[hot_update] regenerate version.json..."
bash scripts/build_version.sh

echo "[hot_update] restart devboard-backend + devboard-frontend..."
systemctl restart devboard-backend.service devboard-frontend.service
sleep 4
systemctl is-active devboard-backend.service devboard-frontend.service

echo "[hot_update] /health:"
curl -sS --max-time 5 http://127.0.0.1:8890/health || echo '  FAIL: /health unreachable'

echo
echo "[hot_update] /api/version:"
curl -sS --max-time 5 http://127.0.0.1:8890/api/version || echo '  FAIL: /api/version unreachable'

echo
echo "[hot_update] /api/dashboard/llm-usage (no cookie, expect 401):"
curl -sS -o /dev/null -w '  status: %{http_code}\n' --max-time 5 \
  http://127.0.0.1:8890/api/dashboard/llm-usage

echo
echo "=== hot_update: done ($OLD_REV → $NEW_REV) ==="
