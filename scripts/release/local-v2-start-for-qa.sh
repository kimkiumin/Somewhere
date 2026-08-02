#!/usr/bin/env bash
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

bash "$ROOT_DIR/scripts/release/local-v2-prepare.sh"
exec bash "$ROOT_DIR/scripts/release/local-v2-serve.sh"
