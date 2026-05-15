#!/usr/bin/env bash
# One-shot box4 onboard + deploy (Ola/#225-E). Drives ssh + scp from the
# operator's laptop. Reads ../crm/.secrets/SERVERS.env for BOX4_* vars.
#
# Idempotent: clone-or-update, scp .env only if missing, daemon-reload
# always, hot_update always.
#
# Usage (from Ola_devboard/ repo root):
#   bash scripts/deploy_box4.sh
#   SERVERS_ENV=/other/path bash scripts/deploy_box4.sh

set -eu

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SERVERS_ENV="${SERVERS_ENV:-../crm/.secrets/SERVERS.env}"
if [[ ! -f "$SERVERS_ENV" ]]; then
  echo "[deploy_box4] FAIL: $SERVERS_ENV not found." >&2
  echo "  Set SERVERS_ENV=/path/to/SERVERS.env or symlink." >&2
  exit 1
fi

set -a; source "$SERVERS_ENV"; set +a
: "${BOX4_HOST:?BOX4_HOST not set in $SERVERS_ENV}"
: "${BOX4_USER:?BOX4_USER not set}"
: "${BOX4_PASS:?BOX4_PASS not set}"

if ! command -v sshpass >/dev/null; then
  echo "[deploy_box4] FAIL: sshpass not installed locally." >&2
  echo "  macOS: brew install hudochenkov/sshpass/sshpass" >&2
  echo "  Debian: apt-get install sshpass" >&2
  exit 1
fi

SSH() { sshpass -p "$BOX4_PASS" ssh -o StrictHostKeyChecking=no "$BOX4_USER@$BOX4_HOST" "$@"; }
SCP() { sshpass -p "$BOX4_PASS" scp -o StrictHostKeyChecking=no "$@"; }

echo "=== deploy_box4: target=$BOX4_USER@$BOX4_HOST ==="

# Step 1 — prereqs on box4
echo "[deploy_box4] step 1: box4 prereq check"
if ! SSH "command -v node && command -v npm && command -v git"; then
  echo "[deploy_box4] FAIL: box4 missing node/npm/git." >&2
  echo "  On box4: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs git" >&2
  exit 1
fi
SSH "node --version && npm --version && git --version"

# Step 2 — clone or fast-forward
echo "[deploy_box4] step 2: clone / update /opt/Ola_devboard"
SSH "
set -eu
if [[ ! -d /opt/Ola_devboard/.git ]]; then
  echo '  cloning fresh...'
  git clone https://github.com/SeekMi-Technologies/Ola_devboard /opt/Ola_devboard
else
  echo '  pulling latest main...'
  cd /opt/Ola_devboard
  git fetch origin main
  git checkout main
  git pull --ff-only origin main
fi
"

# Step 3 — .env (do not overwrite)
echo "[deploy_box4] step 3: /opt/Ola_devboard/.env"
if SSH "test -f /opt/Ola_devboard/.env"; then
  echo "  already exists — leaving untouched"
else
  if [[ ! -f "$REPO_ROOT/.env" ]]; then
    echo "[deploy_box4] FAIL: local .env missing — cannot seed box4." >&2
    echo "  Fill .env from .env.example (DATABASE, DEVBOARD_PASSWORD, SESSION_SECRET, etc.)" >&2
    exit 1
  fi
  echo "  copying local .env (verify values before going live)"
  SCP "$REPO_ROOT/.env" "$BOX4_USER@$BOX4_HOST:/opt/Ola_devboard/.env"
  SSH "chmod 600 /opt/Ola_devboard/.env"
fi

# Step 4 — install systemd units
echo "[deploy_box4] step 4: systemd units"
SCP "$REPO_ROOT/scripts/systemd/devboard-backend.service" \
    "$BOX4_USER@$BOX4_HOST:/etc/systemd/system/devboard-backend.service"
SCP "$REPO_ROOT/scripts/systemd/devboard-frontend.service" \
    "$BOX4_USER@$BOX4_HOST:/etc/systemd/system/devboard-frontend.service"
SSH "
chmod 644 /etc/systemd/system/devboard-backend.service /etc/systemd/system/devboard-frontend.service
systemctl daemon-reload
"

# Step 5 — build + restart via hot_update
echo "[deploy_box4] step 5: hot_update (build + restart)"
SSH "bash /opt/Ola_devboard/scripts/hot_update.sh"

# Step 6 — enable on boot
echo "[deploy_box4] step 6: enable on boot"
SSH "systemctl enable devboard-backend.service devboard-frontend.service" || true

echo
echo "=== deploy_box4: done ==="
echo "Next:"
echo "  - Configure nginx + Cloudflare per docs/DEPLOY_BOX4.md §4"
echo "  - Verify https://devboard.olatech.ai/health → 200"
