#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK_DIR="$ROOT_DIR/.git/hooks"
POST_COMMIT_SRC="$ROOT_DIR/scripts/hooks/post-commit"
POST_COMMIT_DST="$HOOK_DIR/post-commit"
PRE_PUSH_SRC="$ROOT_DIR/scripts/hooks/pre-push"
PRE_PUSH_DST="$HOOK_DIR/pre-push"

if [[ ! -d "$HOOK_DIR" ]]; then
  echo "Git hooks directory not found at $HOOK_DIR"
  echo "Run this from inside the repository root clone."
  exit 1
fi

cp "$POST_COMMIT_SRC" "$POST_COMMIT_DST"
chmod +x "$POST_COMMIT_DST"

cp "$PRE_PUSH_SRC" "$PRE_PUSH_DST"
chmod +x "$PRE_PUSH_DST"

echo "Installed post-commit hook: $POST_COMMIT_DST"
echo "Installed pre-push guard: $PRE_PUSH_DST"
echo "Set OPENCODE_REMOTE_SKIP_POST_COMMIT_REDEPLOY=1 to temporarily skip auto redeploy."
