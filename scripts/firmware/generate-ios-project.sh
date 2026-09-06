#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_ROOT/../.." && pwd)"
XCODEGEN="$PROJECT_ROOT/.tools/xcodegen/xcodegen/bin/xcodegen"

if [[ ! -x "$XCODEGEN" ]]; then
    printf '%s\n' "XcodeGen is missing. Run: bun run firmware:setup" >&2
    exit 1
fi

cd "$PROJECT_ROOT/ios"
"$XCODEGEN" generate --spec project.yml
