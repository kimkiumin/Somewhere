#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_ROOT/common.sh"
require_toolchain
mkdir -p "$FIRMWARE_BUILD_ROOT"

COMPILE_LOG="$PROJECT_ROOT/.local-artifacts/firmware-compile.log"
set +e
arduino_cli compile \
    --fqbn "$FIRMWARE_FQBN" \
    --build-path "$FIRMWARE_BUILD_ROOT" \
    --jobs 1 \
    --warnings all \
    "$FIRMWARE_ROOT" >"$COMPILE_LOG" 2>&1
compile_status=$?
set -e
cat "$COMPILE_LOG"
if [[ "$compile_status" -ne 0 ]]; then
    exit "$compile_status"
fi

flash_percent="$(sed -n 's/^Sketch uses .* (\([0-9][0-9]*\)%) of program storage space\..*/\1/p' "$COMPILE_LOG" | tail -1)"
ram_percent="$(sed -n 's/^Global variables use .* (\([0-9][0-9]*\)%) of dynamic memory.*/\1/p' "$COMPILE_LOG" | tail -1)"
if [[ -z "$flash_percent" || -z "$ram_percent" ]]; then
    printf '%s\n' "Unable to read Arduino flash/RAM usage from $COMPILE_LOG" >&2
    exit 1
fi
if (( flash_percent >= 90 )); then
    printf '%s\n' "Firmware flash assertion failed: ${flash_percent}% is at or above the 90% limit." >&2
    exit 1
fi
printf '%s\n' "Firmware flash assertion: ${flash_percent}% < 90%; RAM: ${ram_percent}%"
