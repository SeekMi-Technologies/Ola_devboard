#!/usr/bin/env bash
# Boot the devboard's backend (8890) and frontend (3001) together. Ctrl-C
# kills both children. Mirrors the CRM start-dev.sh ergonomics so muscle
# memory carries over.
#
# Usage: bash start-dev.sh

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "[start-dev] WARNING: $ROOT/.env not found. Copy .env.example -> .env first." >&2
fi

cat <<'BANNER'
============================================================
  Ola_devboard — booting both processes

    backend  → http://127.0.0.1:8890   (loopback by default; auth-gated)
    frontend → http://127.0.0.1:3001   (open this in your browser)

  Auth: set DEVBOARD_PASSWORD + SESSION_SECRET in .env (see .env.example).
  Bind: set BACKEND_HOST=0.0.0.0 ONLY in prod (box4); local dev stays loopback.

  Smoke shell (after .env sourced):
    set -a; source .env; set +a
    bash backend/test/integration/test_devboard_smoke.sh

  Ctrl-C to stop both processes.
============================================================
BANNER

# Track child PIDs so we can clean them up on Ctrl-C.
PIDS=()

cleanup() {
  echo
  echo "[start-dev] received signal, killing children: ${PIDS[*]}"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Backend
(cd "$ROOT/backend" && npm run dev) &
PIDS+=($!)

# Frontend
(cd "$ROOT/frontend" && npm run dev) &
PIDS+=($!)

# Park here until either child exits or a signal arrives.
wait
