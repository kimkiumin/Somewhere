#pragma once

namespace roll_compass {

float normalizeDegrees(float value);
float shortestDeltaDegrees(float from, float to);
float relativeNeedleAngle(
    float magneticHeading,
    float declinationEast,
    float targetTrueBearing
);
float compassRoseAngle(float magneticHeading, float declinationEast);

}  // namespace roll_compass
