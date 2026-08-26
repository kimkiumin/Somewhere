#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_ROOT/../.." && pwd)"
TOOL_ROOT="$PROJECT_ROOT/.tools"
ARDUINO_CLI="$TOOL_ROOT/arduino-cli/arduino-cli"
XCODEGEN="$TOOL_ROOT/xcodegen/xcodegen/bin/xcodegen"
ARDUINO_CONFIG_ROOT="$PROJECT_ROOT/.local-artifacts/arduino-cli"
ARDUINO_CONFIG_FILE="$ARDUINO_CONFIG_ROOT/arduino-cli.yaml"
ARDUINO_DATA_ROOT="$ARDUINO_CONFIG_ROOT/data"
FIRMWARE_ROOT="$PROJECT_ROOT/firmware/roll-compass-board"
FIRMWARE_BUILD_ROOT="$PROJECT_ROOT/.local-artifacts/firmware-build"
FIRMWARE_FQBN="esp32:esp32:waveshare_esp32_s3_touch_lcd_21"

arduino_cli() {
    "$ARDUINO_CLI" --config-file "$ARDUINO_CONFIG_FILE" "$@"
}

require_toolchain() {
    if [[ ! -x "$ARDUINO_CLI" ]]; then
        printf '%s\n' "Arduino CLI is missing. Run: bun run firmware:setup" >&2
        exit 1
    fi
    if [[ ! -f "$ARDUINO_CONFIG_FILE" ]]; then
        printf '%s\n' "Arduino CLI is not configured. Run: bun run firmware:setup" >&2
        exit 1
    fi
}

detect_board_port() {
    if [[ -n "${BOARD_PORT:-}" ]]; then
        printf '%s\n' "$BOARD_PORT"
        return 0
    fi

    local detected_ports=()
    while IFS= read -r port_entry; do
        [[ -n "$port_entry" ]] && detected_ports+=("$port_entry")
    done < <(find /dev -maxdepth 1 -type c -name 'cu.usbmodem*' -print 2>/dev/null | sort)

    if [[ "${#detected_ports[@]}" -ne 1 ]]; then
        printf '%s\n' "Expected exactly one /dev/cu.usbmodem* board port; found ${#detected_ports[@]}." >&2
        printf '%s\n' "Set BOARD_PORT=/dev/cu.usbmodem... when more than one device is connected." >&2
        printf '%s\n' "Detected ports:" >&2
        printf '  %s\n' "${detected_ports[@]:-none}" >&2
        exit 1
    fi
    printf '%s\n' "${detected_ports[0]}"
}
