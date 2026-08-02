#!/usr/bin/env bash
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DIST_DIR="${1:-$ROOT_DIR/app/dist}"
readonly BUILD_LOG="${V2_EVIDENCE_DIR:-/tmp}/local-v2-build-boundary.txt"
readonly BUDGET_BYTES="${V2_INITIAL_BUDGET_BYTES:-153600}"

[[ "$BUDGET_BYTES" =~ ^[1-9][0-9]*$ ]] || {
  printf 'V2_INITIAL_BUDGET_BYTES must be a positive integer\n' >&2
  exit 2
}

if rg -n 'somewhereTest|DeterministicV2Api|createTestComposition|__somewhereV2LocalSensorControl|direct.?bearing' \
  "$DIST_DIR" >"$BUILD_LOG"; then
  printf 'production bundle contains a forbidden test or direct-bearing symbol\n' >&2
  exit 1
fi

readonly COMPRESSED_BYTES="$(
  find "$DIST_DIR" -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) \
    -print0 | sort -z | xargs -0 gzip -9 -c | wc -c
)"
[[ "$COMPRESSED_BYTES" -le "$BUDGET_BYTES" ]] || {
  printf 'compressed initial surface exceeds %s bytes: %s\n' \
    "$BUDGET_BYTES" "$COMPRESSED_BYTES" >&2
  exit 1
}

printf 'BUILD_BOUNDARY_PASS=true\n'
printf 'COMPRESSED_INITIAL_BYTES=%s\n' "$COMPRESSED_BYTES"
