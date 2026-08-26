#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_ROOT/../.." && pwd)"
BUILD_ROOT="$PROJECT_ROOT/.local-artifacts/firmware-host-test"
mkdir -p "$BUILD_ROOT"

c++ -std=c++17 -Wall -Wextra -Werror -pedantic \
    -I"$PROJECT_ROOT/firmware/roll-compass-board" \
    "$SCRIPT_ROOT/physical_compass_wire_test.cpp" \
    "$PROJECT_ROOT/firmware/roll-compass-board/physical_compass_protocol.cpp" \
    "$PROJECT_ROOT/firmware/roll-compass-board/display_copy.cpp" \
    -o "$BUILD_ROOT/physical_compass_wire_test"

"$BUILD_ROOT/physical_compass_wire_test"

bash "$SCRIPT_ROOT/display_source_contract_test.sh"
