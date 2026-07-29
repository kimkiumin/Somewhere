#!/usr/bin/env bash
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly BASE_URL="${SOMEWHERE_BASE_URL:-https://127.0.0.1:8787}"

curl --insecure --silent --fail --max-time 2 "$BASE_URL/api/v1/health" >/dev/null

export SOMEWHERE_BASE_URL="$BASE_URL"
curl() {
  command curl --insecure "$@"
}
export -f curl

bash "$ROOT_DIR/server/test/curl-hidden-slice.sh"
bash "$ROOT_DIR/server/test/curl-lifecycle.sh"
bash "$ROOT_DIR/server/test/curl-feedback-deletion.sh"

printf 'PASS real V2 Worker contract, lifecycle, security, feedback, and deletion\n'
