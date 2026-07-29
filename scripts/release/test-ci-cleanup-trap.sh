#!/usr/bin/env bash
set -euo pipefail

SIGNAL=""
RECEIPT=""
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --signal) SIGNAL="${2:-}"; shift 2 ;;
    --receipt) RECEIPT="${2:-}"; shift 2 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

case "$SIGNAL" in HUP) STATUS=129 ;; INT) STATUS=130 ;; TERM) STATUS=143 ;; *) exit 2 ;; esac
[[ -n "$RECEIPT" ]]

TEST_TMP="$(mktemp -d -t somewhere-v2-ci.XXXXXXXX)"
READY_FILE="$TEST_TMP/child-ready"
CHILD_PID=""
WAITED=false

cleanup_group() {
  if [[ -n "$CHILD_PID" ]]; then
    if kill -0 -- "-$CHILD_PID" 2>/dev/null; then
      kill -TERM -- "-$CHILD_PID"
    fi
    set +e
    wait "$CHILD_PID"
    WAIT_STATUS=$?
    set -e
    [[ "$WAIT_STATUS" -eq 143 || "$WAIT_STATUS" -eq 0 ]]
    WAITED=true
  fi
}

handle_signal() {
  trap - EXIT HUP INT TERM
  cleanup_group
  rm -rf -- "$TEST_TMP"
  mkdir -p "$(dirname "$RECEIPT")"
  printf '{"schemaVersion":1,"signal":"%s","tempRemoved":true,"handlerTerminated":true,"processGroupTerminated":true,"waited":%s}\n' \
    "$SIGNAL" "$WAITED" > "$RECEIPT"
  exit "$STATUS"
}

trap handle_signal "$SIGNAL"
setsid bash -c '
  trap "exit 143" TERM
  : > "$1"
  while :; do
    sleep 30 &
    wait "$!"
  done
' bash "$READY_FILE" &
CHILD_PID=$!

for _ in {1..200}; do
  [[ -f "$READY_FILE" ]] && break
  sleep 0.01
done
[[ -f "$READY_FILE" ]]
kill -0 -- "-$CHILD_PID"

kill "-$SIGNAL" "$$"
exit 95
