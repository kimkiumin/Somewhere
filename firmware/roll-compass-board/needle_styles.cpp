#include "needle_styles.h"

#include <math.h>

namespace roll_compass {

namespace {

constexpr float kPi = 3.14159265358979323846f;
constexpr int16_t kCenter = kInstrumentFaceCenter;

struct NeedleAxes {
    float forwardX;
    float forwardY;
    float sideX;
    float sideY;
};

NeedleAxes axesForAngle(float angleDegrees) {
    if (!isfinite(angleDegrees)) angleDegrees = 0.0f;
    const float radians = angleDegrees * kPi / 180.0f;
    return NeedleAxes{
        sinf(radians),
        -cosf(radians),
        cosf(radians),
        sinf(radians),
    };
}

InstrumentPoint pointAt(const NeedleAxes &axes, float forward, float side = 0.0f) {
    return InstrumentPoint{
        static_cast<int16_t>(
            kCenter + static_cast<int16_t>(axes.forwardX * forward + axes.sideX * side)
        ),
        static_cast<int16_t>(
            kCenter + static_cast<int16_t>(axes.forwardY * forward + axes.sideY * side)
        ),
    };
}

void setLine(
    NeedleStroke &stroke,
    InstrumentPoint start,
    InstrumentPoint end,
    uint8_t width,
    NeedleTone tone,
    bool rounded = true
) {
    stroke.visible = true;
    stroke.points[0] = start;
    stroke.points[1] = end;
    stroke.pointCount = 2;
    stroke.width = width;
    stroke.tone = tone;
    stroke.rounded = rounded;
}

void setDisc(
    NeedleDisc &disc,
    InstrumentPoint center,
    uint8_t diameter,
    NeedleTone tone
) {
    disc.visible = true;
    disc.center = center;
    disc.diameter = diameter;
    disc.tone = tone;
}

NeedleVisual sourceVisual(const NeedleAxes &axes) {
    NeedleVisual visual;
    setLine(
        visual.strokes[0],
        pointAt(axes, 0.0f),
        pointAt(axes, 139.0f),
        kInstrumentNeedleStrokeWidth,
        NeedleTone::Pink
    );
    return visual;
}

NeedleVisual precisionSpearVisual(const NeedleAxes &axes) {
    NeedleVisual visual;
    setLine(
        visual.strokes[0],
        pointAt(axes, 0.0f),
        pointAt(axes, 64.0f),
        6,
        NeedleTone::Pink,
        false
    );
    setLine(
        visual.strokes[1],
        pointAt(axes, 0.0f),
        pointAt(axes, 108.0f),
        4,
        NeedleTone::Pink,
        false
    );
    setLine(
        visual.strokes[2],
        pointAt(axes, 0.0f),
        pointAt(axes, 136.0f),
        2,
        NeedleTone::Pink,
        false
    );
    setDisc(visual.discs[0], pointAt(axes, 0.0f), 6, NeedleTone::Pink);
    setDisc(visual.discs[1], pointAt(axes, 0.0f), 2, NeedleTone::Background);
    return visual;
}

NeedleVisual dualRailVisual(const NeedleAxes &axes) {
    NeedleVisual visual;
    const InstrumentPoint tip = pointAt(axes, 137.0f);
    setLine(
        visual.strokes[0],
        pointAt(axes, 5.0f, -3.0f),
        tip,
        2,
        NeedleTone::Pink,
        false
    );
    setLine(
        visual.strokes[1],
        pointAt(axes, 5.0f, 3.0f),
        tip,
        2,
        NeedleTone::Pink,
        false
    );
    setDisc(visual.discs[0], pointAt(axes, 0.0f), 10, NeedleTone::Pink);
    setDisc(visual.discs[1], pointAt(axes, 0.0f), 6, NeedleTone::Background);
    return visual;
}

NeedleVisual balancedVisual(const NeedleAxes &axes) {
    NeedleVisual visual;
    setLine(
        visual.strokes[0],
        pointAt(axes, 0.0f),
        pointAt(axes, 64.0f),
        6,
        NeedleTone::Pink,
        false
    );
    setLine(
        visual.strokes[1],
        pointAt(axes, 0.0f),
        pointAt(axes, 108.0f),
        4,
        NeedleTone::Pink,
        false
    );
    setLine(
        visual.strokes[2],
        pointAt(axes, 0.0f),
        pointAt(axes, 136.0f),
        2,
        NeedleTone::Pink,
        false
    );
    setLine(
        visual.strokes[3],
        pointAt(axes, -2.0f),
        pointAt(axes, -42.0f),
        4,
        NeedleTone::OffWhite,
        false
    );
    setDisc(visual.discs[0], pointAt(axes, 0.0f), 10, NeedleTone::OffWhite);
    setDisc(visual.discs[1], pointAt(axes, 0.0f), 6, NeedleTone::Background);
    return visual;
}

NeedleVisual cutlassVisual(const NeedleAxes &axes) {
    NeedleVisual visual;
    NeedleStroke &edge = visual.strokes[0];
    NeedleStroke &blade = visual.strokes[1];
    edge.visible = true;
    edge.pointCount = kNeedleMaximumPoints;
    edge.width = 7;
    edge.tone = NeedleTone::OffWhite;
    edge.rounded = true;
    blade.visible = true;
    blade.pointCount = kNeedleMaximumPoints;
    blade.width = 5;
    blade.tone = NeedleTone::Pink;
    blade.rounded = true;
    for (size_t index = 0; index < kNeedleMaximumPoints; ++index) {
        const float progress = static_cast<float>(index) /
            static_cast<float>(kNeedleMaximumPoints - 1);
        const float curve = 10.0f * sinf(kPi * progress);
        const float bladeInset = 1.5f * sinf(kPi * progress);
        const float forward = 134.0f * progress;
        edge.points[index] = pointAt(axes, forward, curve);
        blade.points[index] = pointAt(axes, forward, curve - bladeInset);
    }
    setLine(
        visual.strokes[2],
        pointAt(axes, -2.0f, -8.0f),
        pointAt(axes, -2.0f, 8.0f),
        2,
        NeedleTone::OffWhite
    );
    setLine(
        visual.strokes[3],
        pointAt(axes, -2.0f),
        pointAt(axes, -17.0f),
        4,
        NeedleTone::OffWhite
    );
    setLine(
        visual.strokes[4],
        pointAt(axes, -4.0f),
        pointAt(axes, -15.0f),
        1,
        NeedleTone::Pink
    );
    setDisc(visual.discs[0], pointAt(axes, 0.0f), 9, NeedleTone::OffWhite);
    setDisc(visual.discs[1], pointAt(axes, 0.0f), 5, NeedleTone::Background);
    setDisc(visual.discs[2], pointAt(axes, -20.0f), 5, NeedleTone::OffWhite);
    return visual;
}

}  // namespace

NeedleStyle nextNeedleStyle(NeedleStyle style) {
    const size_t next = (static_cast<size_t>(style) + 1U) % kNeedleStyleCount;
    return static_cast<NeedleStyle>(next);
}

NeedleVisual buildNeedleVisual(NeedleStyle style, float angleDegrees) {
    const NeedleAxes axes = axesForAngle(angleDegrees);
    switch (style) {
        case NeedleStyle::Source: return sourceVisual(axes);
        case NeedleStyle::PrecisionSpear: return precisionSpearVisual(axes);
        case NeedleStyle::DualRail: return dualRailVisual(axes);
        case NeedleStyle::Balanced: return balancedVisual(axes);
        case NeedleStyle::Cutlass: return cutlassVisual(axes);
        case NeedleStyle::Count: return sourceVisual(axes);
    }
    return sourceVisual(axes);
}

}  // namespace roll_compass
