#!/usr/bin/env bash
set -euo pipefail

readonly SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT_DIR="$(cd "$SERVER_DIR/.." && pwd)"
readonly PORT="${SOMEWHERE_LOCAL_PORT:-8787}"
readonly HOST=127.0.0.1

if [[ ! "$PORT" =~ ^[0-9]+$ || "$PORT" -lt 1024 || "$PORT" -gt 65535 ]]; then
  printf 'invalid local port\n' >&2
  exit 2
fi

if ss -H -ltn "sport = :$PORT" | grep -q .; then
  printf 'port %s is already in use\n' "$PORT" >&2
  exit 2
fi

RUN_DIR="$(mktemp -d -t somewhere-hidden-slice.XXXXXXXX)"
readonly RUN_DIR
"$SERVER_DIR/scripts/prepare-local-hidden-slice.sh" "$RUN_DIR/state" >"$RUN_DIR/prepare.log" 2>&1

(
  cd "$ROOT_DIR"
  exec setsid bunx wrangler dev \
    --config "$SERVER_DIR/wrangler.jsonc" \
    --ip "$HOST" \
    --port "$PORT" \
    --persist-to "$RUN_DIR/state"
) >"$RUN_DIR/worker.log" 2>&1 &
readonly WORKER_PID=$!

printf '{"pid":%s,"port":%s,"host":"%s","stateDir":"%s","root":"%s","startedAt":%s}\n' \
  "$WORKER_PID" "$PORT" "$HOST" "$RUN_DIR/state" "$ROOT_DIR" "$(date +%s)" \
  >"$RUN_DIR/receipt.json"

ready=false
for _ in $(seq 1 100); do
  if curl --silent --fail --max-time 1 "http://$HOST:$PORT/api/v1/health" >/dev/null 2>&1; then
    ready=true
    break
  fi
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if [[ "$ready" != true ]]; then
  tail -n 80 "$RUN_DIR/worker.log" >&2
  kill -- "-$WORKER_PID" 2>/dev/null || true
  exit 1
fi

printf 'RUN_DIR=%s\n' "$RUN_DIR"
printf 'RECEIPT=%s\n' "$RUN_DIR/receipt.json"
printf 'PID=%s\n' "$WORKER_PID"
printf 'BASE_URL=http://%s:%s\n' "$HOST" "$PORT"
