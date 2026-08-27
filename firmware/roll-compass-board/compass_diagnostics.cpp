#include "compass_diagnostics.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

#include "compass_math.h"

namespace roll_compass {

namespace {

DiagnosticCommand command(DiagnosticCommandType type) {
    DiagnosticCommand parsed;
    parsed.type = type;
    return parsed;
}

bool isNumericToken(const char *value) {
    if (value == nullptr || value[0] == '\0') return false;
    bool hasDigit = false;
    for (const char *cursor = value; *cursor != '\0'; ++cursor) {
        const char character = *cursor;
        if (character >= '0' && character <= '9') {
            hasDigit = true;
            continue;
        }
        if (character != '+' && character != '-' && character != '.' &&
            character != 'e' && character != 'E') {
            return false;
        }
    }
    return hasDigit;
}

DiagnosticCommand numericCommand(
    const char *line,
    const char *prefix,
    DiagnosticCommandType type,
    float minimum,
    float maximum,
    bool maximumInclusive
) {
    const size_t prefixLength = strlen(prefix);
    if (strncmp(line, prefix, prefixLength) != 0) return command(DiagnosticCommandType::Invalid);
    const char *valueText = line + prefixLength;
    if (!isNumericToken(valueText)) return command(DiagnosticCommandType::Invalid);
    char *end = nullptr;
    const float value = strtof(valueText, &end);
    if (end == valueText || *end != '\0' || !isfinite(value) || value < minimum) {
        return command(DiagnosticCommandType::Invalid);
    }
    if (maximumInclusive ? value > maximum : value >= maximum) {
        return command(DiagnosticCommandType::Invalid);
    }
    DiagnosticCommand parsed = command(type);
    parsed.valueDegrees = value;
    return parsed;
}

uint8_t actionMaskForPhase(JourneyPhase phase) {
    switch (phase) {
        case JourneyPhase::Following:
        case JourneyPhase::Near:
            return 1U << 0;
        case JourneyPhase::Paused:
            return static_cast<uint8_t>((1U << 1) | (1U << 2));
        case JourneyPhase::Arrived:
            return 1U << 3;
        default:
            return 0;
    }
}

}  // namespace

DiagnosticCommand parseDiagnosticCommand(const char *line) {
    if (line == nullptr || line[0] == '\0') return command(DiagnosticCommandType::Invalid);
    if (strcmp(line, "sim on") == 0) return command(DiagnosticCommandType::SimOn);
    if (strcmp(line, "sim off") == 0) return command(DiagnosticCommandType::SimOff);
    if (strcmp(line, "state guiding") == 0) return command(DiagnosticCommandType::StateGuiding);
    if (strcmp(line, "state near") == 0) return command(DiagnosticCommandType::StateNear);
    if (strcmp(line, "state paused") == 0) return command(DiagnosticCommandType::StatePaused);
    if (strcmp(line, "state arrived") == 0) return command(DiagnosticCommandType::StateArrived);
    if (strcmp(line, "state calibrating") == 0) return command(DiagnosticCommandType::StateCalibrating);
    if (strcmp(line, "state sensor-missing") == 0) return command(DiagnosticCommandType::StateSensorMissing);
    if (strcmp(line, "state anomaly") == 0) return command(DiagnosticCommandType::StateAnomaly);
    if (strcmp(line, "sweep cw") == 0) return command(DiagnosticCommandType::SweepClockwise);
    if (strcmp(line, "sweep ccw") == 0) return command(DiagnosticCommandType::SweepCounterClockwise);
    if (strcmp(line, "sweep stop") == 0) return command(DiagnosticCommandType::SweepStop);

    DiagnosticCommand parsed = numericCommand(
        line,
        "target ",
        DiagnosticCommandType::Target,
        0.0f,
        360.0f,
        false
    );
    if (parsed.type != DiagnosticCommandType::Invalid) return parsed;
    parsed = numericCommand(
        line,
        "declination ",
        DiagnosticCommandType::Declination,
        -180.0f,
        180.0f,
        true
    );
    if (parsed.type != DiagnosticCommandType::Invalid) return parsed;
    return numericCommand(
        line,
        "heading ",
        DiagnosticCommandType::Heading,
        0.0f,
        360.0f,
        false
    );
}

bool applyDiagnosticCommand(const DiagnosticCommand &commandValue, DiagnosticState &state) {
    switch (commandValue.type) {
        case DiagnosticCommandType::Invalid:
            return false;
        case DiagnosticCommandType::SimOn:
            state.resetSimulation();
            return true;
        case DiagnosticCommandType::SimOff:
            state.enabled_ = false;
            state.visualDemo_ = false;
            state.sweepDirection_ = 0;
            state.sweepClockInitialized_ = false;
            return true;
        case DiagnosticCommandType::StateGuiding:
            state.setOperationalState(JourneyPhase::Following);
            return true;
        case DiagnosticCommandType::StateNear:
            state.setOperationalState(JourneyPhase::Near);
            return true;
        case DiagnosticCommandType::StatePaused:
            state.setOperationalState(JourneyPhase::Paused);
            return true;
        case DiagnosticCommandType::StateArrived:
            state.setOperationalState(JourneyPhase::Arrived);
            return true;
        case DiagnosticCommandType::StateCalibrating:
            state.enabled_ = true;
            state.phase_ = JourneyPhase::Following;
            state.sensorHealth_ = SensorHealth::Ready;
            state.calibrationHealth_ = CalibrationHealth::Collecting;
            return true;
        case DiagnosticCommandType::StateSensorMissing:
            state.enabled_ = true;
            state.phase_ = JourneyPhase::Following;
            state.sensorHealth_ = SensorHealth::Missing;
            state.calibrationHealth_ = CalibrationHealth::Missing;
            return true;
        case DiagnosticCommandType::StateAnomaly:
            state.enabled_ = true;
            state.phase_ = JourneyPhase::Following;
            state.sensorHealth_ = SensorHealth::Anomaly;
            state.calibrationHealth_ = CalibrationHealth::Valid;
            return true;
        case DiagnosticCommandType::Target:
            state.targetTrueBearingDegrees_ = commandValue.valueDegrees;
            return true;
        case DiagnosticCommandType::Declination:
            state.magneticDeclinationDegreesEast_ = commandValue.valueDegrees;
            return true;
        case DiagnosticCommandType::Heading:
            state.enabled_ = true;
            state.boardMagneticHeadingDegrees_ = commandValue.valueDegrees;
            state.sweepDirection_ = 0;
            state.sweepClockInitialized_ = false;
            return true;
        case DiagnosticCommandType::SweepClockwise:
            state.enabled_ = true;
            state.sweepDirection_ = 1;
            state.sweepDegreesPerSecond_ = 45.0f;
            state.sweepClockInitialized_ = false;
            return true;
        case DiagnosticCommandType::SweepCounterClockwise:
            state.enabled_ = true;
            state.sweepDirection_ = -1;
            state.sweepDegreesPerSecond_ = 45.0f;
            state.sweepClockInitialized_ = false;
            return true;
        case DiagnosticCommandType::SweepStop:
            state.sweepDirection_ = 0;
            state.sweepClockInitialized_ = false;
            return true;
    }
    return false;
}

bool DiagnosticState::enabled() const {
    return enabled_;
}

void DiagnosticState::resetSimulation() {
    enabled_ = true;
    visualDemo_ = true;
    sensorHealth_ = SensorHealth::Ready;
    calibrationHealth_ = CalibrationHealth::Valid;
    phase_ = JourneyPhase::Following;
    targetTrueBearingDegrees_ = 0.0f;
    magneticDeclinationDegreesEast_ = 0.0f;
    boardMagneticHeadingDegrees_ = 0.0f;
    sweepDirection_ = 1;
    sweepDegreesPerSecond_ = 18.0f;
    sweepClockInitialized_ = false;
    lastSweepMs_ = 0;
}

void DiagnosticState::setOperationalState(JourneyPhase phase) {
    enabled_ = true;
    phase_ = phase;
    sensorHealth_ = SensorHealth::Ready;
    calibrationHealth_ = CalibrationHealth::Valid;
}

void DiagnosticState::applyTo(RuntimeInput &input, uint32_t nowMs) {
    if (!enabled_) return;
    if (sweepDirection_ != 0) {
        if (sweepClockInitialized_) {
            const uint32_t elapsedMs = nowMs - lastSweepMs_;
            const float deltaDegrees =
                static_cast<float>(sweepDirection_) * sweepDegreesPerSecond_ *
                static_cast<float>(elapsedMs) / 1000.0f;
            boardMagneticHeadingDegrees_ = normalizeDegrees(
                boardMagneticHeadingDegrees_ + deltaDegrees
            );
        }
        lastSweepMs_ = nowMs;
        sweepClockInitialized_ = true;
    }

    input.bootComplete = true;
    input.bleConnected = true;
    input.protocolMismatch = false;
    input.snapshotFresh = true;
    input.sensorHealth = sensorHealth_;
    input.calibrationHealth = calibrationHealth_;
    input.phase = phase_;
    input.hasCredibleTarget = true;
    input.targetTrueBearingDegrees = targetTrueBearingDegrees_;
    input.magneticDeclinationDegreesEast = magneticDeclinationDegreesEast_;
    input.boardMagneticHeadingDegrees = boardMagneticHeadingDegrees_;
    input.hasDistance = visualDemo_;
    input.distanceM = visualDemo_ ? 320.0f : 0.0f;
    input.menu = visualDemo_ ? "TONKATSU" : nullptr;
    input.priceBand = visualDemo_ ? "-" : nullptr;
    input.actionMask = actionMaskForPhase(phase_);
}

}  // namespace roll_compass
