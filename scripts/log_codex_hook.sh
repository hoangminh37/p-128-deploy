#!/usr/bin/env bash
# Run from a Codex hook. stdin is intentionally passed through to log_hook.py.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$repo_root"
exec bash scripts/_pyrun.sh scripts/log_hook.py --tool=codex
