#!/usr/bin/env python3
"""Generate ROM-friendly assets from the supplied SVG and TTF files.

The repository stores only the derived bitmap glyphs and SVG tick geometry.
The original commercial font is intentionally not copied into the repository.
"""

from __future__ import annotations

import argparse
import hashlib
import math
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SCREEN_SIZE = 480
FONT_SIZES = (
    ("LABEL", 8),
    ("SMALL", 16),
    ("DIRECTION", 28),
    ("DISTANCE", 34),
)
GLYPH_CHARACTERS = (
  " ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  "abcdefghijklmnopqrstuvwxyz"
  "0123456789"
  ".-/?"
)


def c_string(value: str) -> str:
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


def render_glyph(font: ImageFont.FreeTypeFont, character: str) -> tuple[int, int, int, int, int, list[int]]:
    bbox = font.getbbox(character, anchor="ls")
    advance = max(0, int(round(font.getlength(character))))
    x0, y0, x1, y1 = bbox
    width = max(0, x1 - x0)
    height = max(0, y1 - y0)
    if width == 0 or height == 0:
        return x0, y0, 0, 0, advance, []

    image = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(image)
    draw.text((-x0, -y0), character, fill=255, font=font, anchor="ls")
    pixel_data = image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()
    return x0, y0, width, height, advance, list(pixel_data)


def write_font_header(font_path: Path, output_path: Path) -> None:
    source_hash = hashlib.sha256(font_path.read_bytes()).hexdigest()
    bitmap: list[int] = []
    glyphs: list[dict[str, int]] = []
    sizes: list[dict[str, int]] = []

    for size_name, pixel_size in FONT_SIZES:
        font = ImageFont.truetype(str(font_path), pixel_size)
        first_glyph = len(glyphs)
        for character in GLYPH_CHARACTERS:
            bearing_x, bearing_y, width, height, advance, pixels = render_glyph(font, character)
            offset = len(bitmap)
            bitmap.extend(pixels)
            glyphs.append(
                {
                    "codepoint": ord(character),
                    "offset": offset,
                    "length": len(pixels),
                    "width": width,
                    "height": height,
                    "bearing_x": bearing_x,
                    "bearing_y": bearing_y,
                    "advance": advance,
                }
            )
        sizes.append(
            {
                "pixel_size": pixel_size,
                "first_glyph": first_glyph,
                "glyph_count": len(glyphs) - first_glyph,
            }
        )

    lines = [
        "#pragma once",
        "",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "",
        "namespace somewhere_font {",
        "",
        "static const char FONT_FAMILY[] = \"Univers Next Pro Thin Condensed\";",
        f"static const char FONT_SOURCE_SHA256[] = {c_string(source_hash)};",
        "static constexpr uint16_t UNIVERS_FONT_PIXEL_SIZE_LABEL = 8;",
        "static constexpr uint16_t UNIVERS_FONT_PIXEL_SIZE_SMALL = 16;",
        "static constexpr uint16_t UNIVERS_FONT_PIXEL_SIZE_DIRECTION = 28;",
        "static constexpr uint16_t UNIVERS_FONT_PIXEL_SIZE_DISTANCE = 34;",
        "",
        "struct BitmapGlyph {",
        "  uint32_t codepoint;",
        "  uint32_t bitmap_offset;",
        "  uint16_t bitmap_length;",
        "  uint8_t width;",
        "  uint8_t height;",
        "  int8_t bearing_x;",
        "  int8_t bearing_y;",
        "  uint8_t advance;",
        "};",
        "",
        "struct FontSize {",
        "  uint16_t pixel_size;",
        "  uint16_t first_glyph;",
        "  uint16_t glyph_count;",
        "};",
        "",
        "static const uint8_t BITMAP[] = {",
    ]
    for start in range(0, len(bitmap), 24):
        values = ", ".join(f"0x{value:02X}" for value in bitmap[start : start + 24])
        lines.append(f"  {values},")
    lines.extend(
        [
            "};",
            "",
            "static const BitmapGlyph GLYPHS[] = {",
        ]
    )
    for glyph in glyphs:
        lines.append(
            "  {"
            f"0x{glyph['codepoint']:02X}, {glyph['offset']}, {glyph['length']}, "
            f"{glyph['width']}, {glyph['height']}, {glyph['bearing_x']}, "
            f"{glyph['bearing_y']}, {glyph['advance']}"
            "},"
        )
    lines.extend(["};", "", "static const FontSize SIZES[] = {"])
    for size in sizes:
        lines.append(
            f"  {{{size['pixel_size']}, {size['first_glyph']}, {size['glyph_count']}}},"
        )
    lines.extend(
        [
            "};",
            "",
            "static constexpr size_t SIZE_COUNT = sizeof(SIZES) / sizeof(SIZES[0]);",
            "",
            "inline const FontSize *findFontSize(uint16_t pixel_size) {",
            "  for (size_t index = 0; index < SIZE_COUNT; ++index) {",
            "    if (SIZES[index].pixel_size == pixel_size) return &SIZES[index];",
            "  }",
            "  return &SIZES[0];",
            "}",
            "",
            "inline const BitmapGlyph *findGlyph(uint16_t pixel_size, uint32_t codepoint) {",
            "  const FontSize *size = findFontSize(pixel_size);",
            "  const BitmapGlyph *fallback = nullptr;",
            "  for (uint16_t index = 0; index < size->glyph_count; ++index) {",
            "    const BitmapGlyph *glyph = &GLYPHS[size->first_glyph + index];",
            "    if (glyph->codepoint == static_cast<uint32_t>('?')) fallback = glyph;",
            "    if (glyph->codepoint == codepoint) return glyph;",
            "  }",
            "  return fallback == nullptr ? &GLYPHS[size->first_glyph] : fallback;",
            "}",
            "",
            "}  // namespace somewhere_font",
            "",
        ]
    )
    output_path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def write_artwork_header(svg_path: Path, output_path: Path) -> None:
    root = ET.parse(svg_path).getroot()
    view_box = [float(value) for value in root.attrib["viewBox"].split()]
    scale = SCREEN_SIZE / view_box[2]
    ticks: list[tuple[int, int, int, int]] = []
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] != "line":
            continue
        if element.attrib.get("class") != "cls-1":
            continue
        values = [float(element.attrib[key]) * scale for key in ("x1", "y1", "x2", "y2")]
        ticks.append(tuple(int(math.floor(value + 0.5)) for value in values))

    source_hash = hashlib.sha256(svg_path.read_bytes()).hexdigest()
    lines = [
        "#pragma once",
        "",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "",
        "namespace somewhere_artwork {",
        "",
        f"static const char SVG_SOURCE_SHA256[] = {c_string(source_hash)};",
        "static constexpr int SCREEN_SIZE = 480;",
        "static constexpr int CENTER_X = 240;",
        "static constexpr int CENTER_Y = 240;",
        "",
        "struct CompassTick {",
        "  int16_t x1;",
        "  int16_t y1;",
        "  int16_t x2;",
        "  int16_t y2;",
        "};",
        "",
        "static const CompassTick TICKS[] = {",
    ]
    for tick in ticks:
        lines.append(f"  {{{tick[0]}, {tick[1]}, {tick[2]}, {tick[3]}}},")
    lines.extend(
        [
            "};",
            "",
            "static constexpr size_t TICK_COUNT = sizeof(TICKS) / sizeof(TICKS[0]);",
            "",
            "}  // namespace somewhere_artwork",
            "",
        ]
    )
    output_path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", type=Path, required=True)
    parser.add_argument("--svg", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_font_header(
        args.font,
        args.output_dir / "univers_next_pro_thin_condensed_font.h",
    )
    write_artwork_header(args.svg, args.output_dir / "compass_artwork.h")


if __name__ == "__main__":
    main()
