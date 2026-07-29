#!/usr/bin/env bash
set -euo pipefail

readonly SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT_DIR="$(cd "$SERVER_DIR/.." && pwd)"
readonly PORT="${SOMEWHERE_LOCAL_PORT:-8787}"
readonly HOST=127.0.0.1
RUN_DIR=""
WORKER_PID=""
WORKER_START_TIME=""
STARTUP_PHASE="validation"
STARTUP_COMPLETE=false

process_group_alive() {
  kill -0 -- "-$WORKER_PID" 2>/dev/null
}

worker_pid_alive() {
  kill -0 "$WORKER_PID" 2>/dev/null
}

worker_stat() {
  local stat stat_fields
  local -a fields
  [[ -r "/proc/$WORKER_PID/stat" ]] || return 1
  stat="$(<"/proc/$WORKER_PID/stat")"
  stat_fields="${stat##*) }"
  read -r -a fields <<<"$stat_fields"
  [[ "${fields[19]:-}" =~ ^[0-9]+$ ]] || return 1
  printf '%s %s %s\n' "${fields[0]:-}" "${fields[2]:-}" "${fields[19]}"
}

worker_pid_identity() {
  local state process_group start_time
  read -r state process_group start_time < <(worker_stat) || return 1
  [[ "$start_time" == "$WORKER_START_TIME" ]]
}

worker_group_identity() {
  local state process_group start_time
  read -r state process_group start_time < <(worker_stat) || return 1
  [[ "$process_group" == "$WORKER_PID" && "$start_time" == "$WORKER_START_TIME" ]]
}

worker_is_zombie() {
  local state process_group start_time
  read -r state process_group start_time < <(worker_stat) || return 1
  [[ "$state" == Z && "$start_time" == "$WORKER_START_TIME" ]]
}

worker_resources_alive() {
  worker_pid_alive || process_group_alive
}

signal_worker() {
  local signal="${1:?signal required}"
  if process_group_alive; then
    worker_group_identity || return 1
    kill "-$signal" -- "-$WORKER_PID"
  elif worker_pid_alive; then
    worker_pid_identity || return 1
    kill "-$signal" "$WORKER_PID"
  fi
}

cleanup_startup() {
  local original_status=$?
  local cleanup_failed=false
  local port_probe
  trap - EXIT HUP INT TERM
  if [[ "$STARTUP_COMPLETE" == true ]]; then
    return "$original_status"
  fi
  if [[ -z "$RUN_DIR" && -z "$WORKER_PID" ]]; then
    return "$original_status"
  fi
  set +e
  [[ "$original_status" -ne 0 ]] || original_status=1

  if [[ -n "$RUN_DIR" ]]; then
    if [[ "$STARTUP_PHASE" == preparation && -f "$RUN_DIR/prepare.log" ]]; then
      tail -n 80 "$RUN_DIR/prepare.log" >&2
    elif [[ "$STARTUP_PHASE" == readiness && -f "$RUN_DIR/worker.log" ]]; then
      tail -n 80 "$RUN_DIR/worker.log" >&2
    fi
    printf 'startup failed during %s (exit %s)\n' "$STARTUP_PHASE" "$original_status" >&2
  fi

  if [[ -n "$WORKER_PID" ]]; then
    if worker_resources_alive; then
      signal_worker TERM 2>/dev/null || {
        printf 'cleanup failure: Worker identity changed or termination failed before TERM: %s\n' "$WORKER_PID" >&2
        cleanup_failed=true
      }
    fi
    for _ in $(seq 1 100); do
      worker_resources_alive || break
      if worker_is_zombie; then
        wait "$WORKER_PID" 2>/dev/null
      fi
      sleep 0.1
    done
    if worker_resources_alive; then
      signal_worker KILL 2>/dev/null || {
        printf 'cleanup failure: Worker identity changed or termination failed before KILL: %s\n' "$WORKER_PID" >&2
        cleanup_failed=true
      }
    fi
    for _ in $(seq 1 100); do
      worker_resources_alive || break
      if worker_is_zombie; then
        wait "$WORKER_PID" 2>/dev/null
      fi
      sleep 0.1
    done
    worker_pid_alive || wait "$WORKER_PID" 2>/dev/null
    if worker_resources_alive; then
      printf 'cleanup failure: Worker PID or process group remains: %s\n' "$WORKER_PID" >&2
      cleanup_failed=true
    fi
  fi

  if ! port_probe="$(ss -H -ltn "sport = :$PORT")"; then
    printf 'cleanup failure: could not verify port %s\n' "$PORT" >&2
    cleanup_failed=true
  elif [[ -n "$port_probe" ]]; then
    printf 'cleanup failure: port %s remains open\n' "$PORT" >&2
    cleanup_failed=true
  fi

  if [[ -n "$RUN_DIR" ]]; then
    if [[ "$RUN_DIR" == /tmp/somewhere-hidden-slice.* && -d "$RUN_DIR" && ! -L "$RUN_DIR" ]]; then
      find "$RUN_DIR" -depth -mindepth 1 -delete
      rmdir "$RUN_DIR"
    else
      printf 'cleanup failure: refusing unguarded run directory: %s\n' "$RUN_DIR" >&2
      cleanup_failed=true
    fi
    if [[ -e "$RUN_DIR" || -L "$RUN_DIR" ]]; then
      printf 'cleanup failure: run directory remains: %s\n' "$RUN_DIR" >&2
      cleanup_failed=true
    fi
  fi

  if [[ "$cleanup_failed" == true ]]; then
    printf 'startup cleanup failed after original exit %s\n' "$original_status" >&2
  fi
  exit "$original_status"
}

trap cleanup_startup EXIT
trap 'STARTUP_PHASE=signal-HUP; exit 129' HUP
trap 'STARTUP_PHASE=signal-INT; exit 130' INT
trap 'STARTUP_PHASE=signal-TERM; exit 143' TERM

if [[ ! "$PORT" =~ ^[0-9]+$ || "$PORT" -lt 1024 || "$PORT" -gt 65535 ]]; then
  printf 'invalid local port\n' >&2
  exit 2
fi

if ss -H -ltn "sport = :$PORT" | grep -q .; then
  printf 'port %s is already in use\n' "$PORT" >&2
  exit 2
fi

STARTUP_PHASE="allocation"
RUN_DIR="$(mktemp -d -t somewhere-hidden-slice.XXXXXXXX)"
readonly RUN_DIR
STARTUP_PHASE="preparation"
"$SERVER_DIR/scripts/prepare-local-hidden-slice.sh" "$RUN_DIR/state" >"$RUN_DIR/prepare.log" 2>&1

STARTUP_PHASE="launch"
readonly STARTUP_ACK="$RUN_DIR/startup-ready"
readonly SUPERVISOR_STATUS="$RUN_DIR/supervisor-status"
(
  cd "$ROOT_DIR"
  exec setsid bash -c '
    acknowledgement=$1
    status_file=$2
    shift 2
    trap ":" HUP INT TERM
    "$@" &
    child=$!
    child_status=0
    while kill -0 "$child" 2>/dev/null; do
      wait "$child"
      child_status=$?
    done
    printf "%s\n" "$child_status" > "$status_file"
    while [[ ! -e "$acknowledgement" ]]; do
      sleep 0.1
    done
    while :; do
      sleep 0.1
    done
  ' somewhere-startup-supervisor "$STARTUP_ACK" "$SUPERVISOR_STATUS" bunx wrangler dev \
    --config "$SERVER_DIR/wrangler.jsonc" \
    --ip "$HOST" \
    --port "$PORT" \
    --persist-to "$RUN_DIR/state"
) >"$RUN_DIR/worker.log" 2>&1 &
WORKER_PID=$!
readonly WORKER_PID
for _ in $(seq 1 100); do
  if WORKER_START_TIME="$(worker_stat | awk '{print $3}')"; then
    [[ "$WORKER_START_TIME" =~ ^[0-9]+$ ]] && break
  fi
  kill -0 "$WORKER_PID" 2>/dev/null || break
  sleep 0.01
done
readonly WORKER_START_TIME
[[ "$WORKER_START_TIME" =~ ^[0-9]+$ ]] || {
  printf 'Worker process identity unavailable\n' >&2
  exit 1
}
for _ in $(seq 1 100); do
  if worker_group_identity; then
    break
  fi
  kill -0 "$WORKER_PID" 2>/dev/null || break
  sleep 0.01
done
worker_group_identity || {
  printf 'Worker process-group identity unavailable\n' >&2
  exit 1
}

printf '{"schemaVersion":1,"pid":%s,"processStartTime":"%s","processGroupId":%s,"port":%s,"host":"%s","stateDir":"%s","root":"%s","startedAt":%s}\n' \
  "$WORKER_PID" "$WORKER_START_TIME" "$WORKER_PID" "$PORT" "$HOST" \
  "$RUN_DIR/state" "$ROOT_DIR" "$(date +%s)" \
  >"$RUN_DIR/receipt.json"

STARTUP_PHASE="readiness"
ready=false
for _ in $(seq 1 100); do
  if curl --silent --fail --max-time 1 "http://$HOST:$PORT/api/v1/health" >/dev/null 2>&1; then
    ready=true
    break
  fi
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    break
  fi
  if [[ -f "$SUPERVISOR_STATUS" ]]; then
    break
  fi
  sleep 0.1
done

if [[ "$ready" != true ]]; then
  exit 1
fi

printf 'RUN_DIR=%s\n' "$RUN_DIR"
printf 'RECEIPT=%s\n' "$RUN_DIR/receipt.json"
printf 'PID=%s\n' "$WORKER_PID"
printf 'BASE_URL=http://%s:%s\n' "$HOST" "$PORT"
: >"$STARTUP_ACK"
STARTUP_COMPLETE=true
