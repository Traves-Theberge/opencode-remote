#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[redeploy] Building compose service image (no cache)..."
docker compose build --no-cache remote

echo "[redeploy] Recreating remote container..."
docker compose up -d --force-recreate remote

echo "[redeploy] Container status:"
docker compose ps remote

echo "[redeploy] Recent runtime logs:"
docker compose logs --tail 60 remote
