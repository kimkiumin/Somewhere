#pragma once

namespace roll_compass {

class NeedleSpring {
public:
    void reset(float angleDegrees);
    float step(float targetDegrees, float deltaSeconds);

    float angleDegrees() const { return angleDegrees_; }
    float velocityDegreesPerSecond() const { return velocityDegreesPerSecond_; }

private:
    float angleDegrees_ = 0.0f;
    float velocityDegreesPerSecond_ = 0.0f;
};

}  // namespace roll_compass
