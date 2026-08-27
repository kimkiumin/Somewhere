#pragma once

namespace roll_compass {

float normalizeDegrees(float value);
float shortestDeltaDegrees(float from, float to);
float relativeNeedleAngle(
    float magneticHeading,
    float declinationEast,
    float targetTrueBearing
);

}  // namespace roll_compass
