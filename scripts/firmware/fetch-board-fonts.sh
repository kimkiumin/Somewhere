#!/usr/bin/env bash
set -euo pipefail

script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_root/../.." && pwd)"
font_root="$project_root/.local-artifacts/firmware-fonts"
google_fonts_commit="6a003b5eb672dc8bf5bff5937cf5863f8b175445"
mkdir -p "$font_root"

download_verified() {
  local filename="$1"
  local expected_sha="$2"
  local encoded_filename="$3"
  local destination="$font_root/$filename"
  local existing_sha=""
  if [[ -f "$destination" ]]; then
    existing_sha="$(shasum -a 256 "$destination" | awk '{print $1}')"
    if [[ "$existing_sha" == "$expected_sha" ]]; then
      return 0
    fi
  fi

  local temporary
  temporary="$(mktemp "$font_root/.download.XXXXXX")"
  trap 'rm -f "$temporary"' RETURN
  curl --fail --location --silent --show-error --retry 3 \
    "https://raw.githubusercontent.com/google/fonts/$google_fonts_commit/ofl/notosanskr/$encoded_filename" \
    --output "$temporary"
  local downloaded_sha
  downloaded_sha="$(shasum -a 256 "$temporary" | awk '{print $1}')"
  if [[ "$downloaded_sha" != "$expected_sha" ]]; then
    printf '%s\n' "Checksum mismatch for $filename: expected $expected_sha, got $downloaded_sha" >&2
    exit 1
  fi
  mv "$temporary" "$destination"
  trap - RETURN
}

download_verified \
  "NotoSansKR[wght].ttf" \
  "194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252" \
  "NotoSansKR%5Bwght%5D.ttf"
download_verified \
  "OFL.txt" \
  "1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9" \
  "OFL.txt"

printf '%s\n' "Verified board fonts in $font_root"
