#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQ_FILE="$ROOT_DIR/scripts/asr-requirements.txt"

if ! command -v python3 >/dev/null 2>&1; then
  printf "python3 not found; skipping local ASR prereq install\n" >&2
  exit 0
fi

if ! python3 -m pip --version >/dev/null 2>&1; then
  printf "python3 pip not found; install pip to enable local ASR\n" >&2
  exit 0
fi

printf "Installing local ASR Python dependencies...\n"
if python3 -m pip install --user -r "$REQ_FILE"; then
  printf "Local ASR prereqs installed with --user scope\n"
  exit 0
fi

printf "Retrying with --break-system-packages...\n"
python3 -m pip install --break-system-packages -r "$REQ_FILE"
printf "Local ASR prereqs installed\n"
