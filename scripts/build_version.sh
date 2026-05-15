#!/usr/bin/env bash
# Generate backend/src/version.json from git metadata at build/deploy time.
# Called by scripts/hot_update.sh (box4) and locally before `npm start`.
# Output is gitignored — never commit. If git is unavailable, fields fall
# back to "unknown" so the running backend still serves /api/version.

set -eu

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/backend/src/version.json"

REV=$(git -C "$ROOT" describe --tags --always --dirty 2>/dev/null || echo 'unknown')
SHORT=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown')
LONG=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo 'unknown')
BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')
BUILT_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Tag-only — strip "-<n>-g<sha>" + "-dirty" trailers from `git describe`.
# When the HEAD has no tag at all, REV equals the short sha and we set tag=null.
TAG=$(echo "$REV" | sed 's/-[0-9]*-g[0-9a-f]*$//' | sed 's/-dirty$//')
if [[ "$TAG" == "$SHORT" || "$TAG" == "unknown" ]]; then
  TAG_JSON='null'
else
  TAG_JSON="\"$TAG\""
fi

cat > "$OUT" <<EOF
{
  "rev": "$REV",
  "sha": "$LONG",
  "shaShort": "$SHORT",
  "branch": "$BRANCH",
  "tag": $TAG_JSON,
  "builtAt": "$BUILT_AT"
}
EOF

echo "[build_version] wrote $OUT"
echo "[build_version] rev=$REV branch=$BRANCH builtAt=$BUILT_AT"
