#pragma once

#include <stddef.h>
#include <stdint.h>

#include "compass_layout.h"

namespace roll_compass {

enum class NeedleStyle : uint8_t {
    Source = 0,
    PrecisionSpear,
    DualRail,
    Balanced,
    Cutlass,
    Count,
};

constexpr size_t kNeedleStyleCount = static_cast<size_t>(NeedleStyle::Count);
constexpr size_t kNeedleMaximumStrokes = 5;
constexpr size_t kNeedleMaximumDiscs = 3;
constexpr size_t kNeedleMaximumPoints = 9;

enum class NeedleTone : uint8_t {
    Pink,
    OffWhite,
    Background,
};

struct NeedleStroke {
    bool visible = false;
    InstrumentPoint points[kNeedleMaximumPoints] = {};
    uint8_t pointCount = 0;
    uint8_t width = 0;
    NeedleTone tone = NeedleTone::Pink;
    uint8_t opacity = 255;
    bool rounded = true;
};

struct NeedleDisc {
    bool visible = false;
    InstrumentPoint center{};
    uint8_t diameter = 0;
    NeedleTone tone = NeedleTone::Pink;
    uint8_t opacity = 255;
};

struct NeedleVisual {
    NeedleStroke strokes[kNeedleMaximumStrokes] = {};
    NeedleDisc discs[kNeedleMaximumDiscs] = {};
};

NeedleStyle nextNeedleStyle(NeedleStyle style);
NeedleVisual buildNeedleVisual(NeedleStyle style, float angleDegrees);

}  // namespace roll_compass
