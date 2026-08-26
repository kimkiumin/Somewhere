#include "compass_runtime.h"

#include <math.h>
#include <string.h>

#include "compass_math.h"

namespace roll_compass {

namespace {

bool isActiveGuidancePhase(JourneyPhase phase) {
    return phase == JourneyPhase::Following || phase == JourneyPhase::RouteRecovery ||
        phase == JourneyPhase::Near;
}

bool hasValidDirection(const RuntimeInput &input) {
    return input.hasCredibleTarget && isfinite(input.targetTrueBearingDegrees) &&
        input.targetTrueBearingDegrees >= 0.0f && input.targetTrueBearingDegrees < 360.0f &&
        isfinite(input.magneticDeclinationDegreesEast) &&
        input.magneticDeclinationDegreesEast >= -180.0f &&
        input.magneticDeclinationDegreesEast <= 180.0f &&
        isfinite(input.boardMagneticHeadingDegrees) &&
        input.boardMagneticHeadingDegrees >= 0.0f && input.boardMagneticHeadingDegrees < 360.0f;
}

uint8_t allowedActionMask(CompassOsState state) {
    constexpr uint8_t stop = 1U << 0;
    constexpr uint8_t continueJourney = 1U << 1;
    constexpr uint8_t confirmStop = 1U << 2;
    constexpr uint8_t reveal = 1U << 3;
    switch (state) {
        case CompassOsState::Guiding:
        case CompassOsState::Near:
            return stop;
        case CompassOsState::Paused:
            return continueJourney | confirmStop;
        case CompassOsState::Arrived:
            return reveal;
        default:
            return 0;
    }
}

}  // namespace

JourneyPhase journeyPhaseFromWire(const char *phase) {
    if (phase == nullptr) return JourneyPhase::Unknown;
    if (strcmp(phase, "idle") == 0 || strcmp(phase, "ready") == 0) return JourneyPhase::Idle;
    if (strcmp(phase, "finding") == 0 || strcmp(phase, "selecting") == 0) {
        return JourneyPhase::Selecting;
    }
    if (strcmp(phase, "committed") == 0) return JourneyPhase::Committed;
    if (strcmp(phase, "following") == 0) return JourneyPhase::Following;
    if (strcmp(phase, "route-recovery") == 0) return JourneyPhase::RouteRecovery;
    if (strcmp(phase, "near") == 0) return JourneyPhase::Near;
    if (strcmp(phase, "paused") == 0) return JourneyPhase::Paused;
    if (strcmp(phase, "arrived") == 0) return JourneyPhase::Arrived;
    if (strcmp(phase, "stopped") == 0) return JourneyPhase::Stopped;
    if (strcmp(phase, "completed") == 0) return JourneyPhase::Completed;
    if (strcmp(phase, "expired") == 0) return JourneyPhase::Expired;
    return JourneyPhase::Unknown;
}

CompassRenderModel reduceRuntime(const RuntimeInput &input) {
    CompassRenderModel model;
    if (input.hasDistance && isfinite(input.distanceM) && input.distanceM >= 0.0f) {
        model.hasDistance = true;
        model.distanceM = input.distanceM;
    }

    if (!input.bootComplete) {
        model.state = CompassOsState::Boot;
    } else if (input.protocolMismatch) {
        model.state = CompassOsState::UpdateRequired;
    } else if (!input.bleConnected) {
        model.state = CompassOsState::Pairing;
    } else if (input.sensorHealth == SensorHealth::Missing ||
               input.sensorHealth == SensorHealth::Fault) {
        model.state = CompassOsState::SensorMissing;
    } else if (input.sensorHealth == SensorHealth::WarmingUp ||
               input.calibrationHealth != CalibrationHealth::Valid) {
        model.state = CompassOsState::Calibrating;
    } else if (input.sensorHealth == SensorHealth::Anomaly) {
        model.state = CompassOsState::MagneticAnomaly;
    } else if (!input.snapshotFresh ||
               (isActiveGuidancePhase(input.phase) && !hasValidDirection(input))) {
        model.state = CompassOsState::Stale;
    } else {
        switch (input.phase) {
            case JourneyPhase::Following:
            case JourneyPhase::RouteRecovery:
                model.state = CompassOsState::Guiding;
                break;
            case JourneyPhase::Near:
                model.state = CompassOsState::Near;
                break;
            case JourneyPhase::Paused:
            case JourneyPhase::Stopped:
                model.state = CompassOsState::Paused;
                break;
            case JourneyPhase::Arrived:
            case JourneyPhase::Completed:
                model.state = CompassOsState::Arrived;
                break;
            case JourneyPhase::Idle:
            case JourneyPhase::Selecting:
            case JourneyPhase::Committed:
            case JourneyPhase::Expired:
            case JourneyPhase::Unknown:
                model.state = CompassOsState::Ready;
                break;
        }
    }

    const bool pointingState =
        model.state == CompassOsState::Guiding || model.state == CompassOsState::Near;
    if (pointingState && hasValidDirection(input)) {
        model.showNeedle = true;
        model.targetNeedleAngleDegrees = relativeNeedleAngle(
            input.boardMagneticHeadingDegrees,
            input.magneticDeclinationDegreesEast,
            input.targetTrueBearingDegrees
        );
    }
    if (model.state == CompassOsState::UpdateRequired) {
        model.hasDistance = false;
        model.distanceM = 0.0f;
    }
    model.actionMask = input.actionMask & allowedActionMask(model.state);
    return model;
}

}  // namespace roll_compass
