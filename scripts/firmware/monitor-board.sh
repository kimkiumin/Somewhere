#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_ROOT/common.sh"
require_toolchain
BOARD_PORT="$(detect_board_port)"
printf '%s\n' "Monitoring $BOARD_PORT at 115200 baud. Press Ctrl-C to exit."
arduino_cli monitor --port "$BOARD_PORT" --config baudrate=115200

