#!/usr/bin/env bash
set -euo pipefail

script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_root/../.." && pwd)"

"$script_root/fetch-board-fonts.sh"
python3 "$script_root/generate-compass-assets.py"
"$script_root/generate-board-fonts.sh"
python3 "$script_root/validate-generated-assets.py"

printf '%s\n' "Generated and validated Roll Compass board assets"
