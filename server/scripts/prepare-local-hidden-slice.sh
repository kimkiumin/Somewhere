#!/usr/bin/env bash
set -euo pipefail

readonly SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT_DIR="$(cd "$SERVER_DIR/.." && pwd)"
readonly STATE_DIR="${1:?usage: prepare-local-hidden-slice.sh <isolated-state-dir>}"

[[ "$STATE_DIR" == /tmp/somewhere-hidden-slice.* ]] || {
  printf 'refusing unguarded state directory: %s\n' "$STATE_DIR" >&2
  exit 2
}
mkdir -p "$STATE_DIR"

bun run --cwd "$ROOT_DIR/app" build
bunx wrangler d1 migrations apply DB \
  --local \
  --config "$SERVER_DIR/wrangler.jsonc" \
  --persist-to "$STATE_DIR"

printf 'PREPARED_STATE=%s\n' "$STATE_DIR"
