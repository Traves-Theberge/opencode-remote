#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${OPENCODE_REMOTE_BUILD_ID:-}" ]]; then
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    OPENCODE_REMOTE_BUILD_ID="$(git rev-parse --short HEAD)-$(date +%Y%m%d%H%M%S)"
  else
    OPENCODE_REMOTE_BUILD_ID="local-$(date +%Y%m%d%H%M%S)"
  fi
fi
export OPENCODE_REMOTE_BUILD_ID

echo "[redeploy] Using build id: ${OPENCODE_REMOTE_BUILD_ID}"

REDEPLOY_NO_CACHE="${OPENCODE_REMOTE_REDEPLOY_NO_CACHE:-0}"
if [[ "$REDEPLOY_NO_CACHE" == "1" ]]; then
  echo "[redeploy] Building compose service image (no cache)..."
  docker compose build --no-cache remote
else
  echo "[redeploy] Building compose service image (cache enabled)..."
  docker compose build remote
fi

echo "[redeploy] Recreating remote container..."
docker compose up -d --force-recreate remote

echo "[redeploy] Container status:"
docker compose ps remote

echo "[redeploy] Recent runtime logs:"
docker compose logs --tail 60 remote
