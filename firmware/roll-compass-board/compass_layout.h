#pragma once

#include <stdint.h>

namespace roll_compass {

constexpr int16_t kInstrumentFaceCenter = 240;
constexpr int16_t kInstrumentFaceRadius = 240;
constexpr int16_t kInstrumentNeedleLength = 139;
constexpr int16_t kInstrumentNeedleSafeRadius = 230;

static_assert(kInstrumentNeedleLength <= kInstrumentNeedleSafeRadius);

struct Rect {
    int16_t x;
    int16_t y;
    int16_t width;
    int16_t height;
};

constexpr bool pointFitsCircle(
    int16_t x,
    int16_t y,
    int16_t centerX,
    int16_t centerY,
    int16_t radius
) {
    const int32_t deltaX = static_cast<int32_t>(x) - centerX;
    const int32_t deltaY = static_cast<int32_t>(y) - centerY;
    return deltaX * deltaX + deltaY * deltaY <= static_cast<int32_t>(radius) * radius;
}

constexpr bool rectFitsCircle(
    const Rect &rect,
    int16_t centerX,
    int16_t centerY,
    int16_t radius
) {
    return pointFitsCircle(rect.x, rect.y, centerX, centerY, radius) &&
        pointFitsCircle(rect.x + rect.width, rect.y, centerX, centerY, radius) &&
        pointFitsCircle(rect.x, rect.y + rect.height, centerX, centerY, radius) &&
        pointFitsCircle(
            rect.x + rect.width,
            rect.y + rect.height,
            centerX,
            centerY,
            radius
        );
}

// These are conservative rectangular bounds. Rounded visual corners sit even
// farther inside the physical circular bezel.
constexpr Rect kBrandBounds{144, 54, 192, 28};
constexpr Rect kStatusBounds{110, 76, 260, 24};
constexpr Rect kDistanceBounds{150, 340, 180, 56};
constexpr Rect kPrimaryActionBounds{156, 390, 168, 40};
constexpr Rect kPausedContinueBounds{160, 344, 160, 40};
constexpr Rect kPausedEndBounds{160, 396, 160, 40};

// Bounds mirror the collaborator's 480px smoke-test baselines. Each rectangle
// stays inside the physical circular face even after a 0-30 degree mount
// correction because rotation preserves its distance from the display center.
constexpr Rect kInstrumentNorthBounds{220, 55, 40, 25};
constexpr Rect kInstrumentSouthBounds{220, 382, 40, 25};
constexpr Rect kInstrumentWestBounds{46, 221, 40, 25};
constexpr Rect kInstrumentEastBounds{394, 221, 40, 25};
constexpr Rect kInstrumentRemainingLabelBounds{180, 111, 120, 8};
constexpr Rect kInstrumentDistanceBounds{100, 122, 280, 31};
constexpr Rect kInstrumentPriceLabelBounds{125, 311, 100, 10};
constexpr Rect kInstrumentPriceValueBounds{125, 325, 120, 16};
constexpr Rect kInstrumentMenuLabelBounds{255, 311, 100, 10};
constexpr Rect kInstrumentMenuValueBounds{235, 325, 120, 16};
constexpr Rect kInstrumentStatusBounds{120, 182, 240, 24};
constexpr Rect kInstrumentPrimaryActionBounds{176, 397, 128, 28};
constexpr Rect kInstrumentPausedContinueBounds{95, 388, 140, 30};
constexpr Rect kInstrumentPausedEndBounds{245, 388, 140, 30};

}  // namespace roll_compass
