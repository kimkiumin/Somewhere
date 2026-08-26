#pragma once

#include <stdint.h>

namespace roll_compass {

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

}  // namespace roll_compass
