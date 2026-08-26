#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_ROOT/common.sh"
require_toolchain
mkdir -p "$FIRMWARE_BUILD_ROOT"

arduino_cli compile \
    --fqbn "$FIRMWARE_FQBN" \
    --build-path "$FIRMWARE_BUILD_ROOT" \
    --jobs 1 \
    --warnings all \
    "$FIRMWARE_ROOT"
