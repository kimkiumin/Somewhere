#!/usr/bin/env bash
set -euo pipefail

readonly RUN_DIR="${1:?usage: stop-local-hidden-slice.sh <run-dir>}"
readonly SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT_DIR="$(cd "$SERVER_DIR/.." && pwd)"
[[ "$RUN_DIR" == /tmp/somewhere-hidden-slice.* && -d "$RUN_DIR" && ! -L "$RUN_DIR" ]] || {
  printf 'refusing unguarded run directory: %s\n' "$RUN_DIR" >&2
  exit 2
}
readonly RESOLVED_RUN_DIR="$(realpath -e "$RUN_DIR")"
[[ "$RESOLVED_RUN_DIR" == "$RUN_DIR" && -f "$RUN_DIR/receipt.json" ]] || {
  printf 'invalid run directory\n' >&2
  exit 2
}

read -r PID PORT HOST STATE_DIR ROOT < <(
  bun -e '
    const receipt = await Bun.file(process.argv[1]).json();
    console.log(receipt.pid, receipt.port, receipt.host, receipt.stateDir, receipt.root);
  ' "$RUN_DIR/receipt.json"
)
[[ \
  "$PID" =~ ^[1-9][0-9]*$ &&
  "$PORT" =~ ^[0-9]+$ &&
  "$PORT" -ge 1024 &&
  "$PORT" -le 65535 &&
  "$HOST" == 127.0.0.1 &&
  "$STATE_DIR" == "$RUN_DIR/state" &&
  "$ROOT" == "$ROOT_DIR"
]] || {
  printf 'invalid receipt\n' >&2
  exit 2
}

if kill -0 "$PID" 2>/dev/null; then
  [[ "$(readlink -f "/proc/$PID/cwd")" == "$ROOT_DIR" ]] || {
    printf 'Worker PID root mismatch\n' >&2
    exit 2
  }
  tr '\0' ' ' < "/proc/$PID/cmdline" | grep -F -- "--persist-to $RUN_DIR/state" >/dev/null || {
    printf 'Worker PID command mismatch\n' >&2
    exit 2
  }
  kill -- "-$PID"
  for _ in $(seq 1 100); do
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.1
  done
fi
if kill -0 "$PID" 2>/dev/null; then
  printf 'Worker PID %s did not stop\n' "$PID" >&2
  exit 1
fi
if ss -H -ltn "sport = :$PORT" | grep -q .; then
  printf 'port %s remains open\n' "$PORT" >&2
  exit 1
fi

find "$RUN_DIR" -depth -mindepth 1 -delete
rmdir "$RUN_DIR"
printf 'STOPPED_PID=%s\n' "$PID"
printf 'PORT_CLOSED=%s\n' "$PORT"
printf 'STATE_REMOVED=%s\n' "$RUN_DIR"
