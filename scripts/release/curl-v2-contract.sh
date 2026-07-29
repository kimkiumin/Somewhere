#!/usr/bin/env bash
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_URL="${SOMEWHERE_BASE_URL:-https://127.0.0.1:8787}"
OUTPUT=
SEEN_BASE=false
SEEN_OUTPUT=false
TEMP_OUTPUT=

usage() {
  printf 'Usage: %s [--base-url <https-url>] [--output <absolute-json>]\n' "$0"
}

usage_error() {
  usage >&2
  exit 64
}

if [[ $# -eq 1 && "$1" == "--help" ]]; then
  usage
  exit 0
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      [[ "$SEEN_BASE" == false && $# -ge 2 && -n "$2" ]] || usage_error
      SEEN_BASE=true
      BASE_URL="$2"
      shift 2
      ;;
    --output)
      [[ "$SEEN_OUTPUT" == false && $# -ge 2 && -n "$2" ]] || usage_error
      SEEN_OUTPUT=true
      OUTPUT="$2"
      shift 2
      ;;
    *)
      usage_error
      ;;
  esac
done

[[ "$BASE_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]] || usage_error
BASE_URL="${BASE_URL%/}"
if [[ -n "$OUTPUT" && "$OUTPUT" != /* ]]; then
  usage_error
fi
readonly BASE_URL OUTPUT

cleanup() {
  local exit_code=$?
  [[ -z "$TEMP_OUTPUT" ]] || rm -f -- "$TEMP_OUTPUT"
  if [[ $exit_code -ne 0 && -n "$OUTPUT" ]]; then
    rm -f -- "$OUTPUT"
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

if [[ -n "$OUTPUT" ]]; then
  mkdir -p -- "$(dirname "$OUTPUT")"
  rm -f -- "$OUTPUT"
fi

curl --insecure --silent --fail --max-time 2 "$BASE_URL/api/v1/health" >/dev/null

export SOMEWHERE_BASE_URL="$BASE_URL"
curl() {
  command curl --insecure "$@"
}
export -f curl

bash "$ROOT_DIR/server/test/curl-hidden-slice.sh"
bash "$ROOT_DIR/server/test/curl-lifecycle.sh"
bash "$ROOT_DIR/server/test/curl-feedback-deletion.sh"

if [[ -n "$OUTPUT" ]]; then
  TEMP_OUTPUT="$(mktemp "$(dirname "$OUTPUT")/.curl-v2-contract.XXXXXX")"
  printf '%s\n' \
    "{\"schemaVersion\":1,\"gate\":\"PASS\",\"baseUrl\":\"$BASE_URL\",\"surfaces\":[\"hidden-slice\",\"lifecycle\",\"feedback\",\"deletion\"]}" \
    >"$TEMP_OUTPUT"
  mv -- "$TEMP_OUTPUT" "$OUTPUT"
  TEMP_OUTPUT=
fi

printf 'PASS real V2 Worker contract, lifecycle, security, feedback, and deletion\n'
