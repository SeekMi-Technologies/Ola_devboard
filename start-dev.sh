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

echo "============================================================"
echo "  Ola_devboard — booting backend (8890) + frontend (3001)"
echo "  Bind: 127.0.0.1 only (v0 local-only design)"
echo "  Ctrl-C to stop both processes."
echo "============================================================"

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
