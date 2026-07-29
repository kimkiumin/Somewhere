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

receipt_fields="$(
  bun -e '
    const receipt = await Bun.file(process.argv[1]).json();
    const values = [
      receipt.schemaVersion,
      receipt.pid,
      receipt.processStartTime,
      receipt.processGroupId,
      receipt.port,
      receipt.host,
      receipt.stateDir,
      receipt.root,
    ];
    if (
      receipt.schemaVersion !== 1 ||
      !Number.isSafeInteger(receipt.pid) ||
      typeof receipt.processStartTime !== "string" ||
      !Number.isSafeInteger(receipt.processGroupId) ||
      !Number.isSafeInteger(receipt.port) ||
      typeof receipt.host !== "string" ||
      typeof receipt.stateDir !== "string" ||
      typeof receipt.root !== "string" ||
      values.some((value) => String(value).includes("\n"))
    ) {
      process.exit(2);
    }
    console.log(values.join("\n"));
  ' "$RUN_DIR/receipt.json"
)" || {
  printf 'invalid receipt\n' >&2
  exit 2
}
mapfile -t fields <<<"$receipt_fields"
[[ "${#fields[@]}" -eq 8 ]] || {
  printf 'invalid receipt\n' >&2
  exit 2
}
readonly PID="${fields[1]}"
readonly PROCESS_START_TIME="${fields[2]}"
readonly PROCESS_GROUP_ID="${fields[3]}"
readonly PORT="${fields[4]}"
readonly HOST="${fields[5]}"
readonly STATE_DIR="${fields[6]}"
readonly ROOT="${fields[7]}"
[[ \
  "$PID" =~ ^[1-9][0-9]*$ &&
  "$PROCESS_START_TIME" =~ ^[1-9][0-9]*$ &&
  "$PROCESS_GROUP_ID" == "$PID" &&
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

process_stat() {
  local process_id="${1:?process ID required}"
  local stat stat_fields
  local -a stat_values
  [[ -r "/proc/$process_id/stat" ]] || return 1
  stat="$(<"/proc/$process_id/stat")"
  stat_fields="${stat##*) }"
  read -r -a stat_values <<<"$stat_fields"
  [[ "${stat_values[19]:-}" =~ ^[0-9]+$ ]] || return 1
  printf '%s %s %s\n' \
    "${stat_values[0]:-}" "${stat_values[2]:-}" "${stat_values[19]}"
}

supervisor_identity_matches() {
  local _state process_group_id process_start_time command_line
  read -r _state process_group_id process_start_time < <(process_stat "$PID") || return 1
  [[ \
    "$process_group_id" == "$PROCESS_GROUP_ID" &&
    "$process_start_time" == "$PROCESS_START_TIME" &&
    "$(readlink -f "/proc/$PID/cwd")" == "$ROOT_DIR"
  ]] || return 1
  command_line="$(tr '\0' ' ' < "/proc/$PID/cmdline")"
  [[ \
    "$command_line" == *"somewhere-startup-supervisor"* &&
    "$command_line" == *"--persist-to $RUN_DIR/state"*
  ]]
}

process_group_alive() {
  kill -0 -- "-$PROCESS_GROUP_ID" 2>/dev/null
}

non_supervisor_group_member_alive() {
  local process_id stat stat_fields
  local -a stat_values
  for stat_path in /proc/[0-9]*/stat; do
    process_id="${stat_path#/proc/}"
    process_id="${process_id%/stat}"
    [[ "$process_id" != "$PID" && -r "$stat_path" ]] || continue
    if ! stat="$(<"$stat_path")" 2>/dev/null; then
      continue
    fi
    stat_fields="${stat##*) }"
    read -r -a stat_values <<<"$stat_fields"
    if [[ "${stat_values[2]:-}" == "$PROCESS_GROUP_ID" && "${stat_values[0]:-}" != Z ]]; then
      return 0
    fi
  done
  return 1
}

supervisor_identity_matches || {
  printf 'Worker supervisor identity mismatch\n' >&2
  exit 2
}
process_group_alive || {
  printf 'Worker process group is unavailable\n' >&2
  exit 2
}

kill -TERM -- "-$PROCESS_GROUP_ID"
for _ in $(seq 1 100); do
  non_supervisor_group_member_alive || break
  sleep 0.1
done

supervisor_identity_matches || {
  printf 'Worker supervisor identity changed before KILL\n' >&2
  exit 1
}
kill -KILL -- "-$PROCESS_GROUP_ID"
for _ in $(seq 1 100); do
  if ! kill -0 "$PID" 2>/dev/null && ! process_group_alive; then
    break
  fi
  sleep 0.1
done
if kill -0 "$PID" 2>/dev/null; then
  printf 'Worker PID %s did not stop\n' "$PID" >&2
  exit 1
fi
if process_group_alive; then
  printf 'Worker process group %s did not stop\n' "$PROCESS_GROUP_ID" >&2
  exit 1
fi
if ss -H -ltn "sport = :$PORT" | grep -q .; then
  printf 'port %s remains open\n' "$PORT" >&2
  exit 1
fi

find "$RUN_DIR" -depth -mindepth 1 -delete
rmdir "$RUN_DIR"
printf '{"schemaVersion":1,"gate":"PASS","pid":%s,"processStartTime":"%s","processGroupId":%s,"pidAbsent":true,"processGroupAbsent":true,"port":%s,"portClosed":true,"stateRemoved":"%s"}\n' \
  "$PID" "$PROCESS_START_TIME" "$PROCESS_GROUP_ID" "$PORT" "$RUN_DIR"
