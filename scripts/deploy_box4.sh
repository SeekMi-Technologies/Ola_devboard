#!/usr/bin/env bash
# One-shot box4 onboard + deploy (Ola/#225-E). Drives ssh + scp from the
# operator's laptop. Reads ../crm/.secrets/SERVERS.env for BOX4_* vars
# AND for the prod values it injects into box4's .env — SERVERS.env is
# the single source of truth, your local Ola_devboard/.env stays dev-only.
#
# Idempotent: clone-or-update, .env scp skipped if box4 already has one
# (use --force-env to rotate), daemon-reload always, hot_update always.
#
# Usage (from Ola_devboard/ repo root):
#   bash scripts/deploy_box4.sh
#   bash scripts/deploy_box4.sh --force-env       # overwrite box4 .env
#   SERVERS_ENV=/other/path bash scripts/deploy_box4.sh

set -eu

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── flag parsing ──────────────────────────────────────────────────────────
FORCE_ENV=0
for arg in "$@"; do
  case "$arg" in
    --force-env) FORCE_ENV=1 ;;
    --help|-h)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "[deploy_box4] unknown arg: $arg" >&2
      echo "  See: bash $0 --help" >&2
      exit 2 ;;
  esac
done

# ── source SERVERS.env + sanity-check required keys ───────────────────────
SERVERS_ENV="${SERVERS_ENV:-../crm/.secrets/SERVERS.env}"
if [[ ! -f "$SERVERS_ENV" ]]; then
  echo "[deploy_box4] FAIL: $SERVERS_ENV not found." >&2
  echo "  Set SERVERS_ENV=/path/to/SERVERS.env or symlink." >&2
  exit 1
fi

set -a; source "$SERVERS_ENV"; set +a

# ssh target
: "${BOX4_HOST:?BOX4_HOST not set in $SERVERS_ENV}"
: "${BOX4_USER:?BOX4_USER not set in $SERVERS_ENV}"
: "${BOX4_PASS:?BOX4_PASS not set in $SERVERS_ENV}"

# values that land in box4's /opt/Ola_devboard/.env
: "${DATABASE:?DATABASE not set in $SERVERS_ENV}"
: "${DEVBOARD_PASSWORD:?DEVBOARD_PASSWORD not set in $SERVERS_ENV — add it (Ola/#225-A)}"
: "${SESSION_SECRET:?SESSION_SECRET not set in $SERVERS_ENV — add it (Ola/#225-A)}"
: "${BOX1_TS_IP:?BOX1_TS_IP not set in $SERVERS_ENV — box1 must be in the Tailscale mesh}"
: "${BOX2_TS_IP:?BOX2_TS_IP not set in $SERVERS_ENV — box2 must be in the Tailscale mesh}"

# Persona control-plane vars are OPTIONAL — an env with an empty URL or TOKEN is
# just hidden from the devboard picker. Default to empty so the deploy never fails
# when a given environment isn't wired yet. Fill in SERVERS.env to enable one.
: "${PERSONA_PROD_NANOBOT_URL:=}"
: "${PERSONA_PROD_TOKEN:=}"
: "${PERSONA_PROD_MONGO:=}"
: "${PERSONA_STAGING_NANOBOT_URL:=}"
: "${PERSONA_STAGING_TOKEN:=}"
: "${PERSONA_STAGING_MONGO:=}"

if ! command -v sshpass >/dev/null; then
  echo "[deploy_box4] FAIL: sshpass not installed locally." >&2
  echo "  macOS:  brew install hudochenkov/sshpass/sshpass" >&2
  echo "  Debian: apt-get install sshpass" >&2
  exit 1
fi

SSH() { sshpass -p "$BOX4_PASS" ssh -o StrictHostKeyChecking=no "$BOX4_USER@$BOX4_HOST" "$@"; }
SCP() { sshpass -p "$BOX4_PASS" scp -o StrictHostKeyChecking=no "$@"; }

echo "=== deploy_box4: target=$BOX4_USER@$BOX4_HOST (force-env=$FORCE_ENV) ==="

# ── Step 1 — prereqs on box4 ──────────────────────────────────────────────
echo "[deploy_box4] step 1: box4 prereq check"
if ! SSH "command -v node && command -v npm && command -v git"; then
  echo "[deploy_box4] FAIL: box4 missing node/npm/git." >&2
  echo "  On box4: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs git" >&2
  exit 1
fi
SSH "node --version && npm --version && git --version"

# ── Step 2 — clone or fast-forward ────────────────────────────────────────
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

# ── Step 3 — generate + scp box4 .env from SERVERS.env vars ───────────────
echo "[deploy_box4] step 3: /opt/Ola_devboard/.env"
if SSH "test -f /opt/Ola_devboard/.env" && [[ "$FORCE_ENV" -ne 1 ]]; then
  echo "  /opt/Ola_devboard/.env already exists on box4 — keeping it."
  echo "  Rotate creds: edit $SERVERS_ENV then re-run with --force-env"
else
  # Guard: --force-env regenerates .env wholesale from SERVERS.env. If box4 already
  # has a persona env wired (non-empty *_NANOBOT_URL) that SERVERS.env doesn't
  # define, regenerating would silently un-wire it. Abort so the operator backfills
  # SERVERS.env first (rather than discovering the picker lost an env post-deploy).
  if [[ "$FORCE_ENV" -eq 1 ]] && SSH "test -f /opt/Ola_devboard/.env"; then
    existing="$(SSH "cat /opt/Ola_devboard/.env" 2>/dev/null || true)"
    for key in PERSONA_PROD_NANOBOT_URL PERSONA_STAGING_NANOBOT_URL; do
      cur="$(printf '%s\n' "$existing" | sed -nE "s/^${key}=['\"]?([^'\"]+).*/\1/p")"
      new="$(eval "printf '%s' \"\${$key}\"")"
      if [[ -n "$cur" && -z "$new" ]]; then
        echo "[deploy_box4] ABORT: box4 .env has $key set, but SERVERS.env does not." >&2
        echo "  --force-env would wipe this wired persona env. Add its PERSONA_* vars" >&2
        echo "  to $SERVERS_ENV first, then re-run." >&2
        exit 1
      fi
    done
  fi
  ENV_TMP=$(mktemp)
  trap "rm -f '$ENV_TMP'" EXIT
  cat > "$ENV_TMP" <<EOF
# Devboard prod .env — generated by scripts/deploy_box4.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Source of truth: $SERVERS_ENV on the operator's laptop.
# Rotate: edit SERVERS.env then re-run \`bash scripts/deploy_box4.sh --force-env\`.

DATABASE='$DATABASE'

BACKEND_PORT=8890
FRONTEND_PORT=3001

# Bind 0.0.0.0 — safe behind auth gate (Ola/#225-A) + nginx reverse proxy
# + ufw firewall in front. NEVER set this without auth in place.
BACKEND_HOST=0.0.0.0

DEVBOARD_PASSWORD='$DEVBOARD_PASSWORD'
SESSION_SECRET='$SESSION_SECRET'

# CF Flexible TLS terminates HTTPS at the edge. Client <-> CF is HTTPS,
# so Secure=1 is correct even though CF <-> box4 is HTTP.
COOKIE_SECURE=1

# Tailscale: Box1 = MCP (8889), Box2 = nanobot serve (8900) + gateway (8901).
MCP_HEALTH_URL=http://$BOX1_TS_IP:8889/health
NANOBOT_SERVE_HEALTH_URL=http://$BOX2_TS_IP:8900/health
NANOBOT_GATEWAY_HEALTH_URL=http://$BOX2_TS_IP:8901/health

# Empty = Logs panel graceful-degrade (decision D4). Box4 has no local mcp.log.
MCP_LOG_FILE_PATH=

# --- Persona control-plane (devboard -> nanobot serve /internal/persona) ---
# Sourced from SERVERS.env. An env whose NANOBOT_URL or TOKEN is empty is hidden
# from the devboard picker. TOKEN must match that box's .persona_token file.
# PROD = Box2 Tailscale:8900 ; STAGING = Box6 Tailscale:8900. *_MONGO empty =>
# fall back to DATABASE above for id->name lookups.
PERSONA_PROD_NANOBOT_URL='$PERSONA_PROD_NANOBOT_URL'
PERSONA_PROD_TOKEN='$PERSONA_PROD_TOKEN'
PERSONA_PROD_MONGO='$PERSONA_PROD_MONGO'
PERSONA_STAGING_NANOBOT_URL='$PERSONA_STAGING_NANOBOT_URL'
PERSONA_STAGING_TOKEN='$PERSONA_STAGING_TOKEN'
PERSONA_STAGING_MONGO='$PERSONA_STAGING_MONGO'
EOF

  if [[ "$FORCE_ENV" -eq 1 ]]; then
    echo "  --force-env: overwriting /opt/Ola_devboard/.env"
  else
    echo "  generating /opt/Ola_devboard/.env from $SERVERS_ENV"
  fi
  SCP "$ENV_TMP" "$BOX4_USER@$BOX4_HOST:/opt/Ola_devboard/.env"
  SSH "chmod 600 /opt/Ola_devboard/.env"
  rm -f "$ENV_TMP"
  trap - EXIT
fi

# ── Step 4 — install systemd units ────────────────────────────────────────
echo "[deploy_box4] step 4: systemd units"
SCP "$REPO_ROOT/scripts/systemd/devboard-backend.service" \
    "$BOX4_USER@$BOX4_HOST:/etc/systemd/system/devboard-backend.service"
SCP "$REPO_ROOT/scripts/systemd/devboard-frontend.service" \
    "$BOX4_USER@$BOX4_HOST:/etc/systemd/system/devboard-frontend.service"
SSH "
chmod 644 /etc/systemd/system/devboard-backend.service /etc/systemd/system/devboard-frontend.service
systemctl daemon-reload
"

# ── Step 5 — build + restart via hot_update ───────────────────────────────
echo "[deploy_box4] step 5: hot_update (build + restart)"
SSH "bash /opt/Ola_devboard/scripts/hot_update.sh"

# ── Step 6 — enable on boot ───────────────────────────────────────────────
echo "[deploy_box4] step 6: enable on boot"
SSH "systemctl enable devboard-backend.service devboard-frontend.service" || true

echo
echo "=== deploy_box4: done ==="
echo "Next:"
echo "  - Verify on box4:    systemctl status devboard-backend devboard-frontend"
echo "  - Verify version:    curl -sS http://127.0.0.1:8890/api/version (on box4)"
echo "  - Configure nginx + CF DNS per docs/DEPLOY_BOX4.md §4"
echo "  - Public smoke:      curl -sS https://devboard.olatech.ai/health"
