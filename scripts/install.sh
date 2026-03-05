#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Traves-Theberge/opencode-remote.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/opencode-remote}"

if ! command -v git >/dev/null 2>&1; then
  printf "git is required but not found\n" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  printf "node is required but not found\n" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  printf "npm is required but not found\n" >&2
  exit 1
fi

if [ ! -d "$INSTALL_DIR/.git" ]; then
  git clone "$REPO_URL" "$INSTALL_DIR"
else
  git -C "$INSTALL_DIR" pull --ff-only
fi

npm --prefix "$INSTALL_DIR" install

printf "\nInstalled OpenCode Remote at %s\n" "$INSTALL_DIR"
printf "Next steps:\n"
printf "  1) cd %s\n" "$INSTALL_DIR"
printf "  2) npm run cli -- setup\n"
printf "  3) npm start\n"
