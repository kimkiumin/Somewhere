#include <assert.h>
#include <math.h>

#include "compass_math.h"
#include "needle_spring.h"

static void assertNear(float actual, float expected, float tolerance = 0.01f) {
    assert(fabsf(actual - expected) <= tolerance);
}

static void assertSpringSettles(float deltaSeconds, int stepCount) {
    roll_compass::NeedleSpring spring;
    spring.reset(350.0f);
    float maximumOvershootDegrees = 0.0f;
    for (int index = 0; index < stepCount; ++index) {
        spring.step(10.0f, deltaSeconds);
        const float overshootDegrees =
            roll_compass::shortestDeltaDegrees(10.0f, spring.angleDegrees());
        if (overshootDegrees > maximumOvershootDegrees) {
            maximumOvershootDegrees = overshootDegrees;
        }
    }
    assertNear(roll_compass::shortestDeltaDegrees(spring.angleDegrees(), 10.0f), 0.0f, 0.15f);
    assert(fabsf(spring.velocityDegreesPerSecond()) < 0.5f);
    assert(maximumOvershootDegrees < 0.5f);
}

int main() {
    assertNear(roll_compass::normalizeDegrees(-1.0f), 359.0f);
    assertNear(roll_compass::shortestDeltaDegrees(359.0f, 1.0f), 2.0f);
    assertNear(roll_compass::shortestDeltaDegrees(1.0f, 359.0f), -2.0f);
    assertNear(roll_compass::relativeNeedleAngle(350.0f, 0.0f, 10.0f), 20.0f);
    assertNear(roll_compass::relativeNeedleAngle(100.0f, -8.0f, 92.0f), 0.0f);

    assertSpringSettles(0.001f, 4'000);
    assertSpringSettles(0.025f, 160);
    assertSpringSettles(0.05f, 80);

    roll_compass::NeedleSpring clampedLow;
    roll_compass::NeedleSpring minimumStep;
    clampedLow.reset(350.0f);
    minimumStep.reset(350.0f);
    assertNear(clampedLow.step(10.0f, -1.0f), minimumStep.step(10.0f, 0.001f), 0.00001f);
    assertNear(
        clampedLow.velocityDegreesPerSecond(),
        minimumStep.velocityDegreesPerSecond(),
        0.00001f
    );
    assert(clampedLow.velocityDegreesPerSecond() > 0.0f);

    roll_compass::NeedleSpring clampedHigh;
    roll_compass::NeedleSpring maximumStep;
    clampedHigh.reset(350.0f);
    maximumStep.reset(350.0f);
    assertNear(clampedHigh.step(10.0f, 1.0f), maximumStep.step(10.0f, 0.05f), 0.00001f);
    assertNear(
        clampedHigh.velocityDegreesPerSecond(),
        maximumStep.velocityDegreesPerSecond(),
        0.00001f
    );
    return 0;
}
