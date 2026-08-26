#!/usr/bin/env bash
set -euo pipefail

script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_root/../.." && pwd)"
firmware_root="$project_root/firmware/roll-compass-board"
font_root="$project_root/.local-artifacts/firmware-fonts"
wordmark_font="$project_root/ios/Somewhere/Resources/Fonts/UnifrakturCook-Bold.ttf"
korean_font="$font_root/NotoSansKR[wght].ttf"
korean_symbols="아이폰을 기다리는 중방향 센서를 연결해 주세요나침반을 움직여 보정하세요준비됐어요바늘을 따라가세요거의 다 왔어요잠시 멈췄어요계속하기여정 끝내기도착했어요아이폰에서 확인하기방향을 확인하는 중자기장을 확인해 주세요업데이트가 필요해요남은 거리"

if [[ ! -f "$wordmark_font" || ! -f "$korean_font" ]]; then
  printf '%s\n' "Board font sources are missing; run fetch-board-fonts.sh first." >&2
  exit 1
fi

generate_font() {
  local source_font="$1"
  local size="$2"
  local symbols="$3"
  local symbol_name="$4"
  local output="$5"
  (
    cd "$project_root"
    bunx --bun lv_font_conv \
      --format lvgl \
      --bpp 4 \
      --size "$size" \
      --font "$source_font" \
      --symbols "$symbols" \
      --lv-include "lvgl.h" \
      --lv-font-name "$symbol_name" \
      --output "$output"
  )
}

generate_font \
  "$wordmark_font" \
  24 \
  "Roll the compass" \
  "roll_compass_wordmark_font" \
  "$firmware_root/roll_compass_wordmark_font.c"
generate_font \
  "$korean_font" \
  16 \
  "$korean_symbols" \
  "roll_compass_korean_16" \
  "$firmware_root/roll_compass_korean_16.c"
generate_font \
  "$korean_font" \
  20 \
  "$korean_symbols" \
  "roll_compass_korean_20" \
  "$firmware_root/roll_compass_korean_20.c"

printf '%s\n' "Generated LVGL board fonts"
