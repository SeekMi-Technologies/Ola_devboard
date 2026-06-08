#!/usr/bin/env bash
# Build the Ola_devboard Docker images with real git metadata (Ola/#225
# dockerize). Exports GIT_* + BUILT_AT so the backend Dockerfile bakes them
# into src/version.json — without this, /api/version reports rev=unknown.
#
# Usage (from repo root, on the build host):
#   bash scripts/docker_build.sh              # build both images
#   bash scripts/docker_build.sh backend      # build one service
#   bash scripts/docker_build.sh --no-cache   # pass-through compose flags
#
# Then bring it up:  docker compose up -d

set -eu

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export GIT_REV=$(git describe --tags --always --dirty 2>/dev/null || echo unknown)
export GIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo unknown)
export GIT_SHA_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
export GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
export BUILT_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "[docker_build] rev=$GIT_REV branch=$GIT_BRANCH builtAt=$BUILT_AT"
docker compose build "$@"

echo "[docker_build] done. Bring up with: docker compose up -d"
