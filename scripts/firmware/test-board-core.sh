#!/usr/bin/env bash
set -euo pipefail

script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_root/../.." && pwd)"
test_output_root="$project_root/.local-artifacts/firmware-tests"
compiler_bin="${COMPASS_TEST_CXX:-c++}"
mkdir -p "$test_output_root"
"$compiler_bin" -std=c++17 -Wall -Wextra -Werror \
  -I "$project_root/firmware/roll-compass-board" \
  "$project_root/firmware/roll-compass-board/tests/compass_core_test.cpp" \
  "$project_root/firmware/roll-compass-board/compass_math.cpp" \
  "$project_root/firmware/roll-compass-board/needle_spring.cpp" \
  -o "$test_output_root/compass-core-test"
"$test_output_root/compass-core-test"
