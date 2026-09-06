#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_ROOT/../.." && pwd)"
TOOL_ROOT="$PROJECT_ROOT/.tools"
ARDUINO_CLI_VERSION="1.5.1"
ARDUINO_ESP32_VERSION="3.3.11"
XCODEGEN_VERSION="2.46.0"
ARDUINO_CTAGS_VERSION="5.8-arduino11"
ESP32_INDEX_URL="https://espressif.github.io/arduino-esp32/package_esp32_index.json"
ARDUINO_CLI_SHA256="cb952e8c1621c95ef5f1d17831c945e3d0ec5973f89c557a7ec8feb9c4f7d4c9"
XCODEGEN_SHA256="4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806"
ARDUINO_CTAGS_SHA256="86ca843c62aecb9bc531a73d9b6cef33179bd885b1bf8df9e0c7e9761aa9794d"

mkdir -p "$TOOL_ROOT" "$PROJECT_ROOT/.local-artifacts/arduino-cli"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
    printf '%s\n' "This pinned setup currently targets Apple Silicon macOS (Darwin arm64)." >&2
    exit 1
fi

download_and_verify() {
    local download_url="$1"
    local expected_sha256="$2"
    local output_file="$3"
    curl --fail --location --silent --show-error --retry 3 "$download_url" -o "$output_file"
    local actual_sha256
    actual_sha256="$(shasum -a 256 "$output_file" | awk '{print $1}')"
    if [[ "$actual_sha256" != "$expected_sha256" ]]; then
        printf '%s\n' "Checksum mismatch for $output_file" >&2
        exit 1
    fi
}

if [[ ! -x "$TOOL_ROOT/arduino-cli/arduino-cli" ]]; then
    archive_root="$(mktemp -d)"
    archive_file="$archive_root/arduino-cli.tar.gz"
    download_and_verify \
        "https://github.com/arduino/arduino-cli/releases/download/v$ARDUINO_CLI_VERSION/arduino-cli_${ARDUINO_CLI_VERSION}_macOS_ARM64.tar.gz" \
        "$ARDUINO_CLI_SHA256" \
        "$archive_file"
    mkdir -p "$TOOL_ROOT/arduino-cli"
    tar -xzf "$archive_file" -C "$TOOL_ROOT/arduino-cli"
    chmod +x "$TOOL_ROOT/arduino-cli/arduino-cli"
    rm -rf "$archive_root"
fi

if [[ ! -x "$TOOL_ROOT/xcodegen/xcodegen/bin/xcodegen" ]]; then
    archive_root="$(mktemp -d)"
    archive_file="$archive_root/xcodegen.zip"
    download_and_verify \
        "https://github.com/yonaskolb/XcodeGen/releases/download/$XCODEGEN_VERSION/xcodegen.zip" \
        "$XCODEGEN_SHA256" \
        "$archive_file"
    mkdir -p "$TOOL_ROOT/xcodegen"
    unzip -q -o "$archive_file" -d "$TOOL_ROOT/xcodegen"
    chmod +x "$TOOL_ROOT/xcodegen/xcodegen/bin/xcodegen"
    rm -rf "$archive_root"
fi

if [[ ! -x "$TOOL_ROOT/arduino-ctags/bin/ctags" ]]; then
    archive_root="$(mktemp -d)"
    archive_file="$archive_root/arduino-ctags.tar.gz"
    download_and_verify \
        "https://github.com/arduino/ctags/archive/refs/tags/$ARDUINO_CTAGS_VERSION.tar.gz" \
        "$ARDUINO_CTAGS_SHA256" \
        "$archive_file"
    tar -xzf "$archive_file" -C "$archive_root"
    ctags_source="$archive_root/ctags-$ARDUINO_CTAGS_VERSION"
    (
        cd "$ctags_source"
        ./configure --prefix="$TOOL_ROOT/arduino-ctags" --disable-etags
        make -j2 CFLAGS="-g -O2 -D__GNUG__"
        make install
    )
    rm -rf "$archive_root"
fi

ARDUINO_CONFIG_ROOT="$PROJECT_ROOT/.local-artifacts/arduino-cli"
ARDUINO_CONFIG_FILE="$ARDUINO_CONFIG_ROOT/arduino-cli.yaml"
ARDUINO_DATA_ROOT="$ARDUINO_CONFIG_ROOT/data"
ARDUINO_USER_ROOT="$ARDUINO_CONFIG_ROOT/user"
if [[ ! -f "$ARDUINO_CONFIG_FILE" ]]; then
    "$TOOL_ROOT/arduino-cli/arduino-cli" config init --overwrite --dest-dir "$ARDUINO_CONFIG_ROOT"
fi
"$TOOL_ROOT/arduino-cli/arduino-cli" --config-file "$ARDUINO_CONFIG_FILE" config set directories.data "$ARDUINO_DATA_ROOT"
"$TOOL_ROOT/arduino-cli/arduino-cli" --config-file "$ARDUINO_CONFIG_FILE" config set directories.user "$ARDUINO_USER_ROOT"
"$TOOL_ROOT/arduino-cli/arduino-cli" --config-file "$ARDUINO_CONFIG_FILE" config add board_manager.additional_urls "$ESP32_INDEX_URL" || true
"$TOOL_ROOT/arduino-cli/arduino-cli" --config-file "$ARDUINO_CONFIG_FILE" core update-index
"$TOOL_ROOT/arduino-cli/arduino-cli" --config-file "$ARDUINO_CONFIG_FILE" core install "esp32:esp32@$ARDUINO_ESP32_VERSION"

CTAGS_PATH="$ARDUINO_DATA_ROOT/packages/builtin/tools/ctags/5.8-arduino11/ctags"
mkdir -p "$(dirname "$CTAGS_PATH")"
cp "$TOOL_ROOT/arduino-ctags/bin/ctags" "$CTAGS_PATH"
chmod +x "$CTAGS_PATH"

for library_spec in \
    "ESP32_Display_Panel@1.0.4" \
    "ESP32_IO_Expander@1.1.0" \
    "esp-lib-utils@0.2.0" \
    "lvgl@8.4.0" \
    "ArduinoJson@7.4.3"; do
    "$TOOL_ROOT/arduino-cli/arduino-cli" --config-file "$ARDUINO_CONFIG_FILE" lib install "$library_spec"
done

printf '%s\n' "Toolchain ready: Arduino CLI $ARDUINO_CLI_VERSION, XcodeGen $XCODEGEN_VERSION, ESP32 core $ARDUINO_ESP32_VERSION"
"$TOOL_ROOT/arduino-cli/arduino-cli" --config-file "$ARDUINO_CONFIG_FILE" board details --fqbn esp32:esp32:waveshare_esp32_s3_touch_lcd_21 | sed -n '1,80p'
