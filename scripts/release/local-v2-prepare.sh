#!/usr/bin/env bash
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

(
  cd "$ROOT_DIR/app"
  bun --bun vite build --base /
  bun scripts/assert-precache-unique.mjs dist production
)

bash "$ROOT_DIR/scripts/release/assert-v2-bundle-boundary.sh"
bun "$ROOT_DIR/scripts/release/write-v2-build-receipt.mjs" "$ROOT_DIR"
