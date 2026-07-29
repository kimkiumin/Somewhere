#!/usr/bin/env bash
set -euo pipefail

readonly RUN_DIR="${1:?usage: stop-local-hidden-slice.sh <run-dir>}"
[[ "$RUN_DIR" == /tmp/somewhere-hidden-slice.* && -f "$RUN_DIR/receipt.json" ]] || {
  printf 'refusing unguarded run directory: %s\n' "$RUN_DIR" >&2
  exit 2
}

read -r PID PORT ROOT < <(
  bun -e '
    const receipt = await Bun.file(process.argv[1]).json();
    console.log(receipt.pid, receipt.port, receipt.root);
  ' "$RUN_DIR/receipt.json"
)
[[ "$PID" =~ ^[1-9][0-9]*$ && "$PORT" == 8787 && "$ROOT" == /home/tjrgus/* ]] || {
  printf 'invalid receipt\n' >&2
  exit 2
}

if kill -0 "$PID" 2>/dev/null; then
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
if curl --silent --max-time 1 "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1; then
  printf 'port %s remains open\n' "$PORT" >&2
  exit 1
fi

find "$RUN_DIR" -depth -mindepth 1 -delete
rmdir "$RUN_DIR"
printf 'STOPPED_PID=%s\n' "$PID"
printf 'PORT_CLOSED=%s\n' "$PORT"
printf 'STATE_REMOVED=%s\n' "$RUN_DIR"
