#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_ROOT/../.." && pwd)"
PYTHON_ROOT="$PROJECT_ROOT/.tools/firmware-python"
PYTHON_BIN="$PYTHON_ROOT/bin/python"

if [[ ! -x "$PYTHON_BIN" ]]; then
    printf '%s\n' "Firmware Python environment is missing. Run: bun run firmware:setup" >&2
    exit 1
fi

exec "$PYTHON_BIN" "$SCRIPT_ROOT/generate-compass-assets.py" "$@"
