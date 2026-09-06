#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_ROOT/common.sh"
require_toolchain

bash "$SCRIPT_ROOT/compile-board.sh"
BOARD_PORT="$(detect_board_port)"
printf '%s\n' "Uploading FQBN $FIRMWARE_FQBN to $BOARD_PORT"
arduino_cli upload \
    --fqbn "$FIRMWARE_FQBN" \
    --input-dir "$FIRMWARE_BUILD_ROOT" \
    --port "$BOARD_PORT"

