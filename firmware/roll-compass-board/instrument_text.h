#pragma once

#include <lvgl.h>
#include "compass_layout.h"
#include "compass_runtime.h"

namespace roll_compass {

struct InstrumentText {
    char text[kCompassDisplayTextBytes] = {};
    const lv_font_t *font = nullptr;
    Rect bounds{};
    bool usedFallback = false;
    bool truncated = false;
};

// Makes a single-line board presentation. Never changes the original BLE data.
InstrumentText fitInstrumentText(
    const char *text,
    const lv_font_t *asciiFont,
    const lv_font_t *koreanFont,
    Rect bounds
);

}  // namespace roll_compass
