#pragma once

#include <stdint.h>

#include "compass_runtime.h"

namespace roll_compass {

enum class DiagnosticCommandType : uint8_t {
    Invalid,
    SimOn,
    SimOff,
    StateGuiding,
    StateNear,
    StatePaused,
    StateArrived,
    StateCalibrating,
    StateSensorMissing,
    StateAnomaly,
    Target,
    Declination,
    Heading,
    SweepClockwise,
    SweepCounterClockwise,
    SweepStop,
};

struct DiagnosticCommand {
    DiagnosticCommandType type = DiagnosticCommandType::Invalid;
    float valueDegrees = 0.0f;
};

class DiagnosticState {
public:
    bool enabled() const;
    void applyTo(RuntimeInput &input, uint32_t nowMs);

private:
    friend bool applyDiagnosticCommand(const DiagnosticCommand &command, DiagnosticState &state);

    void resetSimulation();
    void setOperationalState(JourneyPhase phase);

    bool enabled_ = true;
    bool visualDemo_ = true;
    SensorHealth sensorHealth_ = SensorHealth::Ready;
    CalibrationHealth calibrationHealth_ = CalibrationHealth::Valid;
    JourneyPhase phase_ = JourneyPhase::Following;
    float targetTrueBearingDegrees_ = 35.0f;
    float magneticDeclinationDegreesEast_ = 0.0f;
    float boardMagneticHeadingDegrees_ = 0.0f;
    int8_t sweepDirection_ = 1;
    float sweepDegreesPerSecond_ = 18.0f;
    bool sweepClockInitialized_ = false;
    uint32_t lastSweepMs_ = 0;
};

DiagnosticCommand parseDiagnosticCommand(const char *line);
bool applyDiagnosticCommand(const DiagnosticCommand &command, DiagnosticState &state);

}  // namespace roll_compass
