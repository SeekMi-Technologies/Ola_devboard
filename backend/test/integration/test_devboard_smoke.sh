#!/usr/bin/env bash
# Live-HTTP smoke for the devboard backend. Run with the BE up on 8890.
# Override target: BACKEND_URL=http://127.0.0.1:9999 bash ...
# DEVBOARD_PASSWORD env must match the backend's; sourced from .env typically:
#   set -a; source .env; set +a; bash backend/test/integration/test_devboard_smoke.sh
# 11 tests: /health, setup-login, 7 panels (cookie-gated), +1 Joi boundary,
#           +1 no-leak invariant, +1 no-cookie 401, +1 wrong-password 401.

set -u

BACKEND="${BACKEND_URL:-http://127.0.0.1:8890}"

PASS=0
FAIL=0

assert_status() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS  $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name (expected HTTP $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_body_has() {
  local name="$1"
  local file="$2"
  local needle="$3"
  if grep -q "$needle" "$file"; then
    echo "  PASS  $name body contains \"$needle\""
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name body missing \"$needle\""
    FAIL=$((FAIL + 1))
  fi
}

assert_body_lacks() {
  local name="$1"
  local file="$2"
  local needle="$3"
  if grep -q "$needle" "$file"; then
    echo "  FAIL  $name body unexpectedly contains \"$needle\""
    FAIL=$((FAIL + 1))
  else
    echo "  PASS  $name body does not leak \"$needle\""
    PASS=$((PASS + 1))
  fi
}

# Pre-flight reachability check — fail fast, not 8x ECONNREFUSED.
if ! curl -s -o /dev/null --max-time 2 "$BACKEND/health"; then
  echo "  FAIL  devboard backend not reachable at $BACKEND. Start it with \`bash start-dev.sh\` first." >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# T1
echo "=== T1: GET /health (devboard process liveness, no cookie) ==="
S=$(curl -s -o "$TMP/t1.json" -w "%{http_code}" "$BACKEND/health")
assert_status "devboard /health" "200" "$S"
assert_body_has "devboard /health" "$TMP/t1.json" '"ok":true'
assert_body_has "devboard /health" "$TMP/t1.json" '"ola-devboard-backend"'

# Setup: log in once and stash the cookie jar. Every protected T2-T9 uses it.
echo
echo "=== Setup: POST /api/auth/login (cookie jar for T2-T9) ==="
if [[ -z "${DEVBOARD_PASSWORD:-}" ]]; then
  echo "  FAIL  DEVBOARD_PASSWORD env not set — source .env first." >&2
  exit 1
fi
S=$(curl -s -c "$TMP/cookies.txt" -o "$TMP/setup_login.json" -w "%{http_code}" \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"$DEVBOARD_PASSWORD\"}" \
  -X POST "$BACKEND/api/auth/login")
if [[ "$S" != "200" ]]; then
  echo "  FAIL  setup login (HTTP $S) — abort. Body:" >&2
  cat "$TMP/setup_login.json" >&2 || true
  exit 1
fi
test -s "$TMP/cookies.txt" || { echo "  FAIL  no cookie jar written" >&2; exit 1; }
echo "  OK    setup login (HTTP 200, cookie saved)"

# T2
echo
echo "=== T2: GET /api/dashboard/llm-usage?range=7d (cookie) ==="
S=$(curl -s -b "$TMP/cookies.txt" -o "$TMP/t2.json" -w "%{http_code}" "$BACKEND/api/dashboard/llm-usage?range=7d")
assert_status "llm-usage" "200" "$S"
assert_body_has "llm-usage" "$TMP/t2.json" '"success":true'
for key in range totals byProviderModel topUsers erroredCount byChannel; do
  assert_body_has "llm-usage" "$TMP/t2.json" "\"$key\""
done

# T3
echo
echo "=== T3: GET /api/dashboard/email-token-usage?range=7d (cookie) ==="
S=$(curl -s -b "$TMP/cookies.txt" -o "$TMP/t3.json" -w "%{http_code}" "$BACKEND/api/dashboard/email-token-usage?range=7d")
assert_status "email-token-usage" "200" "$S"
assert_body_has "email-token-usage" "$TMP/t3.json" '"success":true'
# Either empty-state envelope OR populated aggregation — both valid
if grep -q '"empty":true' "$TMP/t3.json"; then
  assert_body_has "email-token-usage empty path" "$TMP/t3.json" '"hint"'
else
  for key in totals byProviderModel topUsers erroredCount byChannel; do
    assert_body_has "email-token-usage populated" "$TMP/t3.json" "\"$key\""
  done
fi

# T4
echo
echo "=== T4: GET /api/dashboard/users/active?windowMinutes=15 (cookie) ==="
S=$(curl -s -b "$TMP/cookies.txt" -o "$TMP/t4.json" -w "%{http_code}" "$BACKEND/api/dashboard/users/active?windowMinutes=15")
assert_status "users/active" "200" "$S"
assert_body_has "users/active" "$TMP/t4.json" '"success":true'
for key in windowMinutes activeSessionsLast aiActiveUsersLast sessions aiUsers; do
  assert_body_has "users/active" "$TMP/t4.json" "\"$key\""
done

# T5
echo
echo "=== T5: GET /api/dashboard/mcp-health (cookie) ==="
S=$(curl -s -b "$TMP/cookies.txt" -o "$TMP/t5.json" -w "%{http_code}" "$BACKEND/api/dashboard/mcp-health")
assert_status "mcp-health" "200" "$S"
assert_body_has "mcp-health" "$TMP/t5.json" '"success":true'
for key in mcp nanobotServe nanobotGateway; do
  assert_body_has "mcp-health" "$TMP/t5.json" "\"$key\""
done

# T6
echo
echo "=== T6: GET /api/dashboard/logs?source=mcp&limit=10 (cookie) ==="
S=$(curl -s -b "$TMP/cookies.txt" -o "$TMP/t6.json" -w "%{http_code}" "$BACKEND/api/dashboard/logs?source=mcp&limit=10")
assert_status "logs" "200" "$S"
assert_body_has "logs" "$TMP/t6.json" '"success":true'
for key in source limit logs; do
  assert_body_has "logs" "$TMP/t6.json" "\"$key\""
done

# T7
echo
echo "=== T7: GET /api/dashboard/logs?limit=501 (cookie, Joi boundary) ==="
S=$(curl -s -b "$TMP/cookies.txt" -o "$TMP/t7.json" -w "%{http_code}" "$BACKEND/api/dashboard/logs?limit=501")
assert_status "logs limit=501" "400" "$S"

# T8
echo
echo "=== T8: GET /api/dashboard/db-summary (cookie, no connection-string leak) ==="
S=$(curl -s -b "$TMP/cookies.txt" -o "$TMP/t8.json" -w "%{http_code}" "$BACKEND/api/dashboard/db-summary")
assert_status "db-summary" "200" "$S"
assert_body_has "db-summary" "$TMP/t8.json" '"success":true'
assert_body_has "db-summary" "$TMP/t8.json" '"collections"'
# Defensive: response must NOT include a Mongo URI / port / cluster info
assert_body_lacks "db-summary" "$TMP/t8.json" 'mongodb://'
assert_body_lacks "db-summary" "$TMP/t8.json" 'mongodb+srv://'
assert_body_lacks "db-summary" "$TMP/t8.json" '27017'

echo
echo "=== T9: GET /api/dashboard/users/panorama?range=7d (cookie) ==="
S=$(curl -s -b "$TMP/cookies.txt" -o "$TMP/t9.json" -w "%{http_code}" "$BACKEND/api/dashboard/users/panorama?range=7d")
assert_status "users/panorama" "200" "$S"
assert_body_has "users/panorama" "$TMP/t9.json" '"success":true'
for key in range windowStart windowEnd totalUsers activeWindowMinutes users; do
  assert_body_has "users/panorama" "$TMP/t9.json" "\"$key\""
done

# T10: auth gate — no cookie on protected endpoint → 401
echo
echo "=== T10: GET /api/dashboard/llm-usage WITHOUT cookie → 401 ==="
S=$(curl -s -o "$TMP/t10.json" -w "%{http_code}" "$BACKEND/api/dashboard/llm-usage?range=7d")
assert_status "no-cookie llm-usage" "401" "$S"
assert_body_has "no-cookie llm-usage" "$TMP/t10.json" '"success":false'

# T11: auth gate — wrong password on /api/auth/login → 401
echo
echo "=== T11: POST /api/auth/login wrong password → 401 ==="
S=$(curl -s -o "$TMP/t11.json" -w "%{http_code}" \
  -H 'Content-Type: application/json' \
  -d '{"password":"definitely-not-the-right-password-for-smoke"}' \
  -X POST "$BACKEND/api/auth/login")
assert_status "wrong-password login" "401" "$S"

echo
echo "=== Summary: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]] || exit 1
