#!/usr/bin/env bash
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly SERVER_DIR="$ROOT_DIR/server"
readonly HOST=127.0.0.1
readonly PORT=8787
readonly EVIDENCE_DIR="${V2_EVIDENCE_DIR:-/tmp}"
RUN_DIR="$(mktemp -d -t somewhere-v2-qa.XXXXXXXX)"
readonly RUN_DIR
WORKER_PID=
mkdir -p "$EVIDENCE_DIR"

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ -n "$WORKER_PID" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then
    if command -v setsid >/dev/null 2>&1; then
      kill -- "-$WORKER_PID" 2>/dev/null || true
    else
      kill "$WORKER_PID" 2>/dev/null || true
    fi
    for _ in $(seq 1 100); do
      kill -0 "$WORKER_PID" 2>/dev/null || break
      sleep 0.05
    done
  fi
  local port_closed=false
  for _ in $(seq 1 100); do
    if ! curl --insecure --silent --max-time 1 "https://$HOST:$PORT/api/v1/health" >/dev/null 2>&1; then
      port_closed=true
      break
    fi
    sleep 0.05
  done
  if [[ -d "$RUN_DIR" ]]; then
    find "$RUN_DIR" -depth -mindepth 1 -delete 2>/dev/null || true
    rmdir "$RUN_DIR" 2>/dev/null || true
  fi
  local state_removed=false
  [[ ! -d "$RUN_DIR" ]] && state_removed=true
  local pid_json='"none"'
  [[ -n "$WORKER_PID" ]] && pid_json="$WORKER_PID"
  printf '{"exitCode":%s,"pid":%s,"port":%s,"portClosed":%s,"stateRemoved":%s}\n' \
    "$exit_code" "$pid_json" "$PORT" "$port_closed" "$state_removed" \
    >"$EVIDENCE_DIR/process-cleanup.json"
  [[ "$port_closed" == true && "$state_removed" == true ]] || exit 1
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

if curl --insecure --silent --max-time 1 "https://$HOST:$PORT/api/v1/health" >/dev/null 2>&1; then
  printf 'port %s is already serving HTTP\n' "$PORT" >&2
  exit 2
fi

bunx wrangler d1 migrations apply DB \
  --local \
  --config "$SERVER_DIR/wrangler.jsonc" \
  --persist-to "$RUN_DIR/state" \
  >"$RUN_DIR/migrate.log" 2>&1

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$RUN_DIR/local.key" \
  -out "$RUN_DIR/local.crt" \
  -subj "/CN=127.0.0.1" \
  -addext "subjectAltName=IP:127.0.0.1" \
  -days 1 \
  >"$RUN_DIR/certificate.log" 2>&1

(
  cd "$ROOT_DIR"
  if command -v setsid >/dev/null 2>&1; then
    exec setsid bunx wrangler dev \
      --config "$SERVER_DIR/wrangler.jsonc" \
      --ip "$HOST" \
      --port "$PORT" \
      --local-protocol https \
      --https-key-path "$RUN_DIR/local.key" \
      --https-cert-path "$RUN_DIR/local.crt" \
      --persist-to "$RUN_DIR/state"
  else
    exec bunx wrangler dev \
      --config "$SERVER_DIR/wrangler.jsonc" \
      --ip "$HOST" \
      --port "$PORT" \
      --local-protocol https \
      --https-key-path "$RUN_DIR/local.key" \
      --https-cert-path "$RUN_DIR/local.crt" \
      --persist-to "$RUN_DIR/state"
  fi
) >"$RUN_DIR/worker.log" 2>&1 &
WORKER_PID=$!
readonly WORKER_PID

for _ in $(seq 1 200); do
  if curl --insecure --silent --fail --max-time 1 "https://$HOST:$PORT/api/v1/health" >/dev/null 2>&1; then
    printf '{"pid":%s,"port":%s,"runDir":"%s","stateDir":"%s"}\n' \
      "$WORKER_PID" "$PORT" "$RUN_DIR" "$RUN_DIR/state" \
      >"$EVIDENCE_DIR/process-start.json"
    wait "$WORKER_PID"
    exit $?
  fi
  kill -0 "$WORKER_PID" 2>/dev/null || break
  sleep 0.1
done

tail -n 100 "$RUN_DIR/worker.log" >&2
exit 1
