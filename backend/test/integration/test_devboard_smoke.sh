#!/usr/bin/env bash
# Live-HTTP smoke for the devboard backend. Run with the BE up on 8890.
# Override target: BACKEND_URL=http://127.0.0.1:9999 bash ...
# 9 tests: /health, 7 panels, +1 Joi boundary, +1 no-leak invariant.

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
echo "=== T1: GET /health (devboard process liveness) ==="
S=$(curl -s -o "$TMP/t1.json" -w "%{http_code}" "$BACKEND/health")
assert_status "devboard /health" "200" "$S"
assert_body_has "devboard /health" "$TMP/t1.json" '"ok":true'
assert_body_has "devboard /health" "$TMP/t1.json" '"ola-devboard-backend"'

# T2
echo
echo "=== T2: GET /api/dashboard/llm-usage?range=7d ==="
S=$(curl -s -o "$TMP/t2.json" -w "%{http_code}" "$BACKEND/api/dashboard/llm-usage?range=7d")
assert_status "llm-usage" "200" "$S"
assert_body_has "llm-usage" "$TMP/t2.json" '"success":true'
for key in range totals byProviderModel topUsers erroredCount byChannel; do
  assert_body_has "llm-usage" "$TMP/t2.json" "\"$key\""
done

# T3
echo
echo "=== T3: GET /api/dashboard/email-token-usage?range=7d ==="
S=$(curl -s -o "$TMP/t3.json" -w "%{http_code}" "$BACKEND/api/dashboard/email-token-usage?range=7d")
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
echo "=== T4: GET /api/dashboard/users/active?windowMinutes=15 ==="
S=$(curl -s -o "$TMP/t4.json" -w "%{http_code}" "$BACKEND/api/dashboard/users/active?windowMinutes=15")
assert_status "users/active" "200" "$S"
assert_body_has "users/active" "$TMP/t4.json" '"success":true'
for key in windowMinutes activeSessionsLast aiActiveUsersLast sessions aiUsers; do
  assert_body_has "users/active" "$TMP/t4.json" "\"$key\""
done

# T5
echo
echo "=== T5: GET /api/dashboard/mcp-health ==="
S=$(curl -s -o "$TMP/t5.json" -w "%{http_code}" "$BACKEND/api/dashboard/mcp-health")
assert_status "mcp-health" "200" "$S"
assert_body_has "mcp-health" "$TMP/t5.json" '"success":true'
for key in mcp nanobotServe nanobotGateway; do
  assert_body_has "mcp-health" "$TMP/t5.json" "\"$key\""
done

# T6
echo
echo "=== T6: GET /api/dashboard/logs?source=mcp&limit=10 ==="
S=$(curl -s -o "$TMP/t6.json" -w "%{http_code}" "$BACKEND/api/dashboard/logs?source=mcp&limit=10")
assert_status "logs" "200" "$S"
assert_body_has "logs" "$TMP/t6.json" '"success":true'
for key in source limit logs; do
  assert_body_has "logs" "$TMP/t6.json" "\"$key\""
done

# T7
echo
echo "=== T7: GET /api/dashboard/logs?limit=501 (Joi boundary) ==="
S=$(curl -s -o "$TMP/t7.json" -w "%{http_code}" "$BACKEND/api/dashboard/logs?limit=501")
assert_status "logs limit=501" "400" "$S"

# T8
echo
echo "=== T8: GET /api/dashboard/db-summary (no connection-string leak) ==="
S=$(curl -s -o "$TMP/t8.json" -w "%{http_code}" "$BACKEND/api/dashboard/db-summary")
assert_status "db-summary" "200" "$S"
assert_body_has "db-summary" "$TMP/t8.json" '"success":true'
assert_body_has "db-summary" "$TMP/t8.json" '"collections"'
# Defensive: response must NOT include a Mongo URI / port / cluster info
assert_body_lacks "db-summary" "$TMP/t8.json" 'mongodb://'
assert_body_lacks "db-summary" "$TMP/t8.json" 'mongodb+srv://'
assert_body_lacks "db-summary" "$TMP/t8.json" '27017'

echo
echo "=== T9: GET /api/dashboard/users/panorama?range=7d ==="
S=$(curl -s -o "$TMP/t9.json" -w "%{http_code}" "$BACKEND/api/dashboard/users/panorama?range=7d")
assert_status "users/panorama" "200" "$S"
assert_body_has "users/panorama" "$TMP/t9.json" '"success":true'
for key in range windowStart windowEnd totalUsers activeWindowMinutes users; do
  assert_body_has "users/panorama" "$TMP/t9.json" "\"$key\""
done

echo
echo "=== Summary: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]] || exit 1
