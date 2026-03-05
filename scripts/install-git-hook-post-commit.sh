#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK_SRC="$ROOT_DIR/scripts/hooks/post-commit"
HOOK_DIR="$ROOT_DIR/.git/hooks"
HOOK_DST="$HOOK_DIR/post-commit"

if [[ ! -d "$HOOK_DIR" ]]; then
  echo "Git hooks directory not found at $HOOK_DIR"
  echo "Run this from inside the repository root clone."
  exit 1
fi

cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"

echo "Installed post-commit hook: $HOOK_DST"
echo "Set OPENCODE_REMOTE_SKIP_POST_COMMIT_REDEPLOY=1 to temporarily skip auto redeploy."
