#pragma once

#include <stddef.h>
#include <stdint.h>

namespace roll_compass {

enum class CompassOsState : uint8_t {
    Boot,
    Pairing,
    SensorMissing,
    Calibrating,
    Ready,
    Guiding,
    Near,
    Paused,
    Arrived,
    Stale,
    MagneticAnomaly,
    UpdateRequired,
};

enum class JourneyPhase : uint8_t {
    Idle,
    Selecting,
    Committed,
    Following,
    RouteRecovery,
    Near,
    Paused,
    Arrived,
    Stopped,
    Completed,
    Expired,
    Unknown,
};

enum class SensorHealth : uint8_t { Missing, WarmingUp, Ready, Fault, Anomaly };
enum class CalibrationHealth : uint8_t { Missing, Collecting, Valid, Invalid };

constexpr size_t kCompassDisplayTextBytes = 161;

struct RuntimeInput {
    bool bootComplete = false;
    bool bleConnected = false;
    bool protocolMismatch = false;
    bool snapshotFresh = false;
    SensorHealth sensorHealth = SensorHealth::Missing;
    CalibrationHealth calibrationHealth = CalibrationHealth::Missing;
    JourneyPhase phase = JourneyPhase::Idle;
    bool hasCredibleTarget = false;
    float targetTrueBearingDegrees = 0.0f;
    float magneticDeclinationDegreesEast = 0.0f;
    float boardMagneticHeadingDegrees = 0.0f;
    bool hasDistance = false;
    float distanceM = 0.0f;
    uint8_t actionMask = 0;
    const char *menu = nullptr;
    const char *priceBand = nullptr;
};

struct CompassRenderModel {
    CompassOsState state = CompassOsState::Boot;
    bool showNeedle = false;
    bool needleSuppressed = false;
    float targetNeedleAngleDegrees = 0.0f;
    bool hasDistance = false;
    float distanceM = 0.0f;
    uint8_t actionMask = 0;
    char menu[kCompassDisplayTextBytes] = {};
    char priceBand[kCompassDisplayTextBytes] = {};
};

CompassRenderModel reduceRuntime(const RuntimeInput &input);
JourneyPhase journeyPhaseFromWire(const char *phase);

}  // namespace roll_compass
