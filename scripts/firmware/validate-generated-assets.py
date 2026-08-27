#!/usr/bin/env python3
"""Validate generated Roll Compass image metrics and LVGL font symbols."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FIRMWARE_ROOT = ROOT / "firmware/roll-compass-board"
METRICS_PATH = FIRMWARE_ROOT / "compass_asset_metrics.h"


def metric(source: str, name: str) -> int:
    match = re.search(rf"\b{name}\s*=\s*(-?\d+)\s*;", source)
    if match is None:
        raise AssertionError(f"missing generated metric: {name}")
    return int(match.group(1))


def main() -> None:
    assert METRICS_PATH.is_file(), f"missing {METRICS_PATH}"
    source = METRICS_PATH.read_text(encoding="utf-8")
    metrics = {
        "shell_width": metric(source, "kShellWidth"),
        "shell_height": metric(source, "kShellHeight"),
        "needle_width": metric(source, "kNeedleWidth"),
        "needle_height": metric(source, "kNeedleHeight"),
        "needle_pivot_x": metric(source, "kNeedlePivotX"),
        "needle_pivot_y": metric(source, "kNeedlePivotY"),
        "screen_hub_x": metric(source, "kScreenHubX"),
        "screen_hub_y": metric(source, "kScreenHubY"),
        "needle_screen_x": metric(source, "kNeedleScreenX"),
        "needle_screen_y": metric(source, "kNeedleScreenY"),
    }
    assert metrics["shell_width"] == 480
    assert metrics["shell_height"] == 480
    assert 40 <= metrics["needle_width"] <= 180
    assert 180 <= metrics["needle_height"] <= 360
    assert 0 <= metrics["needle_pivot_x"] < metrics["needle_width"]
    assert 0 <= metrics["needle_pivot_y"] < metrics["needle_height"]
    assert metrics["screen_hub_x"] == 240
    assert metrics["screen_hub_y"] == 240
    assert metrics["needle_screen_x"] + metrics["needle_pivot_x"] == 240
    assert metrics["needle_screen_y"] + metrics["needle_pivot_y"] == 240

    expected_fonts = {
        "roll_compass_wordmark_font.c": "roll_compass_wordmark_font",
        "roll_compass_korean_16.c": "roll_compass_korean_16",
        "roll_compass_korean_20.c": "roll_compass_korean_20",
    }
    for filename, symbol in expected_fonts.items():
        font_path = FIRMWARE_ROOT / filename
        assert font_path.is_file(), f"missing {font_path}"
        font_source = font_path.read_text(encoding="utf-8")
        assert re.search(
            rf"\b(?:const\s+)?lv_font_t\s+{symbol}\b", font_source
        ), f"missing lv_font_t declaration for {symbol} in {font_path}"

    print(
        "Validated generated assets: "
        f"shell={metrics['shell_width']}x{metrics['shell_height']}, "
        f"needle={metrics['needle_width']}x{metrics['needle_height']}"
    )


if __name__ == "__main__":
    main()
