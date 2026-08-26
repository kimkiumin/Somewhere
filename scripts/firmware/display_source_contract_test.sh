#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_ROOT/../.." && pwd)"
DISPLAY_SOURCE="$PROJECT_ROOT/firmware/roll-compass-board/display_ui.cpp"
SKETCH_SOURCE="$PROJECT_ROOT/firmware/roll-compass-board/roll-compass-board.ino"
PROTOCOL_SOURCE="$PROJECT_ROOT/firmware/roll-compass-board/physical_compass_protocol.cpp"
COMPILE_SOURCE="$PROJECT_ROOT/scripts/firmware/compile-board.sh"
REPORT_SOURCE="$PROJECT_ROOT/.superpowers/sdd/2026-08-26-ipad-physical-compass-integration/task-5-report.md"

checks=0
failures=0

expect_pattern() {
    local file="$1"
    local pattern="$2"
    local label="$3"
    checks=$((checks + 1))
    if ! rg -q -- "$pattern" "$file"; then
        printf 'FAIL: %s (%s)\n' "$label" "$file" >&2
        failures=$((failures + 1))
    fi
}

expect_fixed() {
    local file="$1"
    local pattern="$2"
    local label="$3"
    checks=$((checks + 1))
    if ! rg -F -q -- "$pattern" "$file"; then
        printf 'FAIL: %s (%s)\n' "$label" "$file" >&2
        failures=$((failures + 1))
    fi
}

expect_order() {
    local file="$1"
    local first_pattern="$2"
    local second_pattern="$3"
    local label="$4"
    checks=$((checks + 1))
    local first_line second_line
    first_line="$(rg -n -m1 -- "$first_pattern" "$file" | cut -d: -f1 || true)"
    second_line="$(rg -n -m1 -- "$second_pattern" "$file" | cut -d: -f1 || true)"
    if [[ -z "$first_line" || -z "$second_line" || "$first_line" -ge "$second_line" ]]; then
        printf 'FAIL: %s (%s)\n' "$label" "$file" >&2
        failures=$((failures + 1))
    fi
}

expect_function_fixed_order() {
    local file="$1"
    local function_pattern="$2"
    local first_text="$3"
    local second_text="$4"
    local label="$5"
    checks=$((checks + 1))
    local start_line first_line second_line first_offset second_offset
    start_line="$(rg -n -m1 -- "$function_pattern" "$file" | cut -d: -f1 || true)"
    if [[ -n "$start_line" ]]; then
        first_offset="$(tail -n +"$((start_line + 1))" "$file" | rg -n -m1 -F -- "$first_text" | cut -d: -f1 || true)"
        second_offset="$(tail -n +"$((start_line + 1))" "$file" | rg -n -m1 -F -- "$second_text" | cut -d: -f1 || true)"
        first_line="${first_offset:+$((start_line + first_offset))}"
        second_line="${second_offset:+$((start_line + second_offset))}"
    else
        first_line=""
        second_line=""
    fi
    if [[ -z "$first_line" || -z "$second_line" || "$first_line" -ge "$second_line" ]]; then
        printf 'FAIL: %s (%s)\n' "$label" "$file" >&2
        failures=$((failures + 1))
    fi
}

expect_fixed "$DISPLAY_SOURCE" 'LV_LABEL_LONG_SCROLL_CIRCULAR' 'menu text uses continuous circular scrolling'
expect_fixed "$DISPLAY_SOURCE" 'lv_label_set_long_mode(categoryValue, LV_LABEL_LONG_SCROLL_CIRCULAR)' 'category label enables continuous scroll'
expect_fixed "$DISPLAY_SOURCE" 'connectionPill = makePill(screen, 176, 307, 128, 24)' 'Bluetooth status uses the lower-center channel'
expect_fixed "$DISPLAY_SOURCE" '#include "display_hangul_font.h"' 'display includes the tracked Hangul font'
expect_fixed "$DISPLAY_SOURCE" '&display_hangul_font_14' 'Korean board copy selects the Hangul font'
expect_fixed "$DISPLAY_SOURCE" 'if (hasState && nowMs - lastStateMs >= physical_compass::kStaleAfterMs)' 'stale tick renders independent of needle visibility'
expect_function_fixed_order "$DISPLAY_SOURCE" '^void displayUiSetState' 'if (!lvgl_port_lock(-1)) return;' 'currentState = state;' 'state mutation is inside the LVGL mutex'
expect_function_fixed_order "$DISPLAY_SOURCE" '^void displayUiSetConnection' 'if (!lvgl_port_lock(-1)) return;' 'if (connected == value)' 'connection read is inside the LVGL mutex'
expect_function_fixed_order "$DISPLAY_SOURCE" '^void displayUiBegin' 'if (!lvgl_port_lock(-1)) return;' 'lv_obj_t *screen = lv_scr_act();' 'UI construction is inside the LVGL mutex'
expect_function_fixed_order "$DISPLAY_SOURCE" '^void displayUiTick' 'if (lvgl_port_lock(-1))' 'if (hasState && nowMs' 'tick reads display state inside the LVGL mutex'
expect_function_fixed_order "$DISPLAY_SOURCE" '^void buttonClicked' 'if (!lvgl_port_lock(-1)) return;' 'eventCallback' 'touch callback takes the LVGL mutex before reading state'
expect_function_fixed_order "$DISPLAY_SOURCE" '^void displayUiSetEventCallback' 'if (!lvgl_port_lock(-1)) return;' 'eventCallback = callback;' 'event callback mutation is inside the LVGL mutex'

expect_function_fixed_order "$SKETCH_SOURCE" '^void onTouchAction' 'xSemaphoreTake(pendingStateMutex' 'boardSession.canEmitAction' 'action authorization is inside the session mutex'
expect_function_fixed_order "$SKETCH_SOURCE" '^void onTouchAction' 'boardSession.canEmitAction' 'sendPhysicalCompassEventLocked' 'action notification follows authorization under the same mutex'
expect_function_fixed_order "$SKETCH_SOURCE" '^void onTouchAction' 'sendPhysicalCompassEventLocked' 'xSemaphoreGive(pendingStateMutex)' 'disconnect cannot invalidate between authorization and notify'
expect_pattern "$SKETCH_SOURCE" 'onStatus' 'notification transport status is observed for recovery'
expect_pattern "$SKETCH_SOURCE" 'kMaxEventDeliveryAttempts' 'notification retry count is bounded'
expect_fixed "$SKETCH_SOURCE" 'for (size_t chunkIndex = 0; chunkIndex < chunks.size(); ++chunkIndex)' 'retry loop preserves event chunk order'
expect_fixed "$SKETCH_SOURCE" 'for (uint8_t attempt = 0; attempt < physical_compass::kMaxEventDeliveryAttempts; ++attempt)' 'retry loop is bounded per chunk'
expect_fixed "$SKETCH_SOURCE" 'if (!eventNotifyFailed)' 'successful notifications are not duplicated'

expect_pattern "$PROTOCOL_SOURCE" 'kMaxJsonDepth' 'parser has an explicit recursion budget'
expect_pattern "$PROTOCOL_SOURCE" 'depth >= kMaxJsonDepth' 'parser checks depth before recursive materialization'
expect_pattern "$COMPILE_SOURCE" 'rm -rf "\$FIRMWARE_BUILD_ROOT"' 'compile helper removes stale build output'
expect_pattern "$REPORT_SOURCE" 'clean build directory before each compile' 'report describes the compile helper clean-build behavior'

if (( failures != 0 )); then
    printf '%d firmware source-contract assertions failed\n' "$failures" >&2
    exit 1
fi
printf 'firmware source-contract tests: %d assertions passed\n' "$checks"
