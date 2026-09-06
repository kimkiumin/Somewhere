#!/usr/bin/env bash
set -euo pipefail

script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_root/../.." && pwd)"
test_output_root="$project_root/.local-artifacts/firmware-tests"
arduino_json_include="$project_root/.local-artifacts/arduino-cli/user/libraries/ArduinoJson/src"
compiler_bin="${COMPASS_TEST_CXX:-c++}"
if [[ ! -f "$arduino_json_include/ArduinoJson.h" ]]; then
  printf '%s\n' "ArduinoJson headers are missing. Run: bun run firmware:setup" >&2
  exit 1
fi
mkdir -p "$test_output_root"
"$compiler_bin" -std=c++17 -Wall -Wextra -Werror \
  -I "$project_root/firmware/roll-compass-board" \
  -I "$arduino_json_include" \
  "$project_root/firmware/roll-compass-board/tests/compass_core_test.cpp" \
  "$project_root/firmware/roll-compass-board/compass_diagnostics.cpp" \
  "$project_root/firmware/roll-compass-board/compass_math.cpp" \
  "$project_root/firmware/roll-compass-board/compass_runtime.cpp" \
  "$project_root/firmware/roll-compass-board/display_content.cpp" \
  "$project_root/firmware/roll-compass-board/needle_spring.cpp" \
  "$project_root/firmware/roll-compass-board/needle_styles.cpp" \
  "$project_root/firmware/roll-compass-board/physical_compass_wire.cpp" \
  "$project_root/firmware/roll-compass-board/screen_power_button.cpp" \
  -o "$test_output_root/compass-core-test"
"$test_output_root/compass-core-test"

rg -q '#define LVGL_PORT_AVOID_TEARING_MODE[[:space:]]*[(]3[)]' \
  "$project_root/firmware/roll-compass-board/lvgl_v8_port.h"
rg -Fq 'configFrameBufferNumber(useDirectMode ? 2 : 1)' \
  "$project_root/firmware/roll-compass-board/roll-compass-board.ino"
rg -q 'LVGL_BUFFER_PARTIAL' \
  "$project_root/firmware/roll-compass-board/lvgl_v8_port.cpp"
rg -q '1310720' \
  "$project_root/firmware/roll-compass-board/roll-compass-board.ino"
rg -Fq 'lv_indev_enable(lvgl_indev, enabled)' \
  "$project_root/firmware/roll-compass-board/lvgl_v8_port.cpp"
rg -Fq 'lv_indev_wait_release(lvgl_indev)' \
  "$project_root/firmware/roll-compass-board/lvgl_v8_port.cpp"
rg -Fq 'lvgl_port_set_touch_enabled(awake)' \
  "$project_root/firmware/roll-compass-board/display_ui.cpp"
