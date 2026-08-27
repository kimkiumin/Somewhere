#include "compass_math.h"

#include <math.h>

namespace roll_compass {

float normalizeDegrees(float value) {
    value = fmodf(value, 360.0f);
    return value < 0.0f ? value + 360.0f : value;
}

float shortestDeltaDegrees(float from, float to) {
    float delta = normalizeDegrees(to) - normalizeDegrees(from);
    if (delta > 180.0f) delta -= 360.0f;
    if (delta < -180.0f) delta += 360.0f;
    return delta;
}

float relativeNeedleAngle(
    float magneticHeading,
    float declinationEast,
    float targetTrueBearing
) {
    const float boardTrueHeading = normalizeDegrees(magneticHeading + declinationEast);
    return shortestDeltaDegrees(boardTrueHeading, targetTrueBearing);
}

}  // namespace roll_compass
