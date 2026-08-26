#include "needle_spring.h"

#include <math.h>

#include "compass_math.h"

namespace roll_compass {

void NeedleSpring::reset(float angleDegrees) {
    angleDegrees_ = normalizeDegrees(angleDegrees);
    velocityDegreesPerSecond_ = 0.0f;
}

float NeedleSpring::step(float targetDegrees, float deltaSeconds) {
    const float dt = fminf(fmaxf(deltaSeconds, 0.001f), 0.05f);
    const float displacement = shortestDeltaDegrees(angleDegrees_, targetDegrees);
    constexpr float stiffness = 115.0f;
    constexpr float damping = 17.0f;
    velocityDegreesPerSecond_ +=
        (stiffness * displacement - damping * velocityDegreesPerSecond_) * dt;
    angleDegrees_ = normalizeDegrees(angleDegrees_ + velocityDegreesPerSecond_ * dt);
    if (fabsf(displacement) < 0.04f && fabsf(velocityDegreesPerSecond_) < 0.2f) {
        angleDegrees_ = normalizeDegrees(targetDegrees);
        velocityDegreesPerSecond_ = 0.0f;
    }
    return angleDegrees_;
}

}  // namespace roll_compass
