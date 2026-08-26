#include <assert.h>
#include <math.h>
#include <string.h>

#include <string>

#include "compass_math.h"
#include "compass_diagnostics.h"
#include "compass_layout.h"
#include "compass_runtime.h"
#include "display_buffer_policy.h"
#include "needle_spring.h"
#include "physical_compass_wire.h"
#include "screen_power_button.h"

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

static roll_compass::RuntimeInput credibleGuidanceInput() {
    roll_compass::RuntimeInput input{};
    input.bootComplete = true;
    input.bleConnected = true;
    input.snapshotFresh = true;
    input.sensorHealth = roll_compass::SensorHealth::Ready;
    input.calibrationHealth = roll_compass::CalibrationHealth::Valid;
    input.phase = roll_compass::JourneyPhase::Following;
    input.hasCredibleTarget = true;
    input.targetTrueBearingDegrees = 10.0f;
    input.magneticDeclinationDegreesEast = 0.0f;
    input.boardMagneticHeadingDegrees = 350.0f;
    input.hasDistance = true;
    input.distanceM = 420.0f;
    input.actionMask = 0xFF;
    return input;
}

static void assertRuntimePrecedence() {
    auto input = credibleGuidanceInput();
    auto guiding = roll_compass::reduceRuntime(input);
    assert(guiding.state == roll_compass::CompassOsState::Guiding);
    assert(guiding.showNeedle);
    assertNear(guiding.targetNeedleAngleDegrees, 20.0f);
    assert(guiding.hasDistance);
    assertNear(guiding.distanceM, 420.0f);
    assert(guiding.actionMask == (1U << 0));

    input.snapshotFresh = false;
    auto stale = roll_compass::reduceRuntime(input);
    assert(stale.state == roll_compass::CompassOsState::Stale);
    assert(!stale.showNeedle);
    assert(stale.actionMask == 0);

    input.sensorHealth = roll_compass::SensorHealth::Missing;
    assert(roll_compass::reduceRuntime(input).state == roll_compass::CompassOsState::SensorMissing);

    input.sensorHealth = roll_compass::SensorHealth::Ready;
    input.protocolMismatch = true;
    auto updateRequired = roll_compass::reduceRuntime(input);
    assert(updateRequired.state == roll_compass::CompassOsState::UpdateRequired);
    assert(!updateRequired.hasDistance);
    assert(updateRequired.actionMask == 0);

    input.bootComplete = false;
    assert(roll_compass::reduceRuntime(input).state == roll_compass::CompassOsState::Boot);
}

static void assertRuntimePhaseMappingAndSuppression() {
    auto input = credibleGuidanceInput();

    input.phase = roll_compass::JourneyPhase::Near;
    auto near = roll_compass::reduceRuntime(input);
    assert(near.state == roll_compass::CompassOsState::Near);
    assert(near.showNeedle);

    input.phase = roll_compass::JourneyPhase::RouteRecovery;
    auto recovering = roll_compass::reduceRuntime(input);
    assert(recovering.state == roll_compass::CompassOsState::Guiding);
    assert(recovering.showNeedle);

    input.hasCredibleTarget = false;
    assert(roll_compass::reduceRuntime(input).state == roll_compass::CompassOsState::Stale);

    input.hasCredibleTarget = true;
    input.targetTrueBearingDegrees = 360.0f;
    auto invalidTarget = roll_compass::reduceRuntime(input);
    assert(invalidTarget.state == roll_compass::CompassOsState::Stale);
    assert(!invalidTarget.showNeedle);

    input = credibleGuidanceInput();
    input.phase = roll_compass::JourneyPhase::Paused;
    auto paused = roll_compass::reduceRuntime(input);
    assert(paused.state == roll_compass::CompassOsState::Paused);
    assert(paused.actionMask == ((1U << 1) | (1U << 2)));
    input.phase = roll_compass::JourneyPhase::Stopped;
    assert(roll_compass::reduceRuntime(input).state == roll_compass::CompassOsState::Paused);
    input.phase = roll_compass::JourneyPhase::Arrived;
    auto arrived = roll_compass::reduceRuntime(input);
    assert(arrived.state == roll_compass::CompassOsState::Arrived);
    assert(arrived.actionMask == (1U << 3));
    input.phase = roll_compass::JourneyPhase::Completed;
    assert(roll_compass::reduceRuntime(input).state == roll_compass::CompassOsState::Arrived);

    input.phase = roll_compass::JourneyPhase::Idle;
    auto ready = roll_compass::reduceRuntime(input);
    assert(ready.state == roll_compass::CompassOsState::Ready);
    assert(!ready.showNeedle);
    assert(ready.actionMask == 0);
}

static void assertWirePhaseMapping() {
    assert(roll_compass::journeyPhaseFromWire("idle") == roll_compass::JourneyPhase::Idle);
    assert(roll_compass::journeyPhaseFromWire("finding") == roll_compass::JourneyPhase::Selecting);
    assert(roll_compass::journeyPhaseFromWire("ready") == roll_compass::JourneyPhase::Idle);
    assert(roll_compass::journeyPhaseFromWire("committed") == roll_compass::JourneyPhase::Committed);
    assert(roll_compass::journeyPhaseFromWire("following") == roll_compass::JourneyPhase::Following);
    assert(roll_compass::journeyPhaseFromWire("route-recovery") == roll_compass::JourneyPhase::RouteRecovery);
    assert(roll_compass::journeyPhaseFromWire("near") == roll_compass::JourneyPhase::Near);
    assert(roll_compass::journeyPhaseFromWire("paused") == roll_compass::JourneyPhase::Paused);
    assert(roll_compass::journeyPhaseFromWire("arrived") == roll_compass::JourneyPhase::Arrived);
    assert(roll_compass::journeyPhaseFromWire("stopped") == roll_compass::JourneyPhase::Stopped);
    assert(roll_compass::journeyPhaseFromWire("completed") == roll_compass::JourneyPhase::Completed);
    assert(roll_compass::journeyPhaseFromWire("expired") == roll_compass::JourneyPhase::Expired);
    assert(roll_compass::journeyPhaseFromWire("other") == roll_compass::JourneyPhase::Unknown);
    assert(roll_compass::journeyPhaseFromWire(nullptr) == roll_compass::JourneyPhase::Unknown);
}

static physical_compass::ParseStateResult parseBoardState(
    const std::string &frame,
    physical_compass::BoardState &state
) {
    return physical_compass::parseStateFrame(
        reinterpret_cast<const uint8_t *>(frame.data()),
        frame.size(),
        state
    );
}

static void assertStrictBleV2Parsing() {
    const std::string valid =
        "{\"v\":2,\"type\":\"state\",\"seq\":7,\"phase\":\"following\",\"d\":420,"
        "\"tb\":10,\"md\":-8.2,\"c\":\"credible\",\"m\":[\"quiet\"],\"p\":\"medium\","
        "\"a\":[\"stop\"],\"r\":false,\"ts\":1234}\n";
    physical_compass::BoardState state;
    assert(parseBoardState(valid, state) == physical_compass::ParseStateResult::Accepted);
    assert(state.sequence == 7);
    assert(strcmp(state.phase, "following") == 0);
    assert(state.hasDirection);
    assertNear(state.targetTrueBearingDegrees, 10.0f);
    assertNear(state.magneticDeclinationDegreesEast, -8.2f);
    assert(state.hasDistance);
    assertNear(state.distanceM, 420.0f);
    assert(state.actions[physical_compass::kStop]);

    const std::string suppressed =
        "{\"v\":2,\"type\":\"state\",\"seq\":8,\"phase\":\"following\","
        "\"c\":\"invalidHeading\",\"m\":[],\"a\":[\"stop\"],\"r\":false,\"ts\":0}\n";
    assert(parseBoardState(suppressed, state) == physical_compass::ParseStateResult::Accepted);
    assert(!state.hasDirection);

    state.sequence = 99;
    const std::string v1 =
        "{\"v\":1,\"type\":\"state\",\"seq\":1,\"phase\":\"following\","
        "\"c\":\"credible\",\"m\":[],\"a\":[],\"r\":false,\"ts\":1}\n";
    assert(parseBoardState(v1, state) == physical_compass::ParseStateResult::UnsupportedVersion);
    assert(state.sequence == 99);
    const std::string v3 =
        "{\"v\":3,\"type\":\"state\",\"seq\":1,\"phase\":\"following\","
        "\"c\":\"credible\",\"m\":[],\"a\":[],\"r\":false,\"ts\":1}\n";
    assert(parseBoardState(v3, state) == physical_compass::ParseStateResult::UnsupportedVersion);
    assert(state.sequence == 99);

    const std::string targetOnly =
        "{\"v\":2,\"type\":\"state\",\"seq\":1,\"phase\":\"following\",\"tb\":10,"
        "\"c\":\"credible\",\"m\":[],\"a\":[],\"r\":false,\"ts\":1}\n";
    assert(parseBoardState(targetOnly, state) == physical_compass::ParseStateResult::Invalid);
    const std::string declinationOnly =
        "{\"v\":2,\"type\":\"state\",\"seq\":1,\"phase\":\"following\",\"md\":0,"
        "\"c\":\"credible\",\"m\":[],\"a\":[],\"r\":false,\"ts\":1}\n";
    assert(parseBoardState(declinationOnly, state) == physical_compass::ParseStateResult::Invalid);
    const std::string legacyBearing =
        "{\"v\":2,\"type\":\"state\",\"seq\":1,\"phase\":\"following\",\"b\":10,"
        "\"c\":\"credible\",\"m\":[],\"a\":[],\"r\":false,\"ts\":1}\n";
    assert(parseBoardState(legacyBearing, state) == physical_compass::ParseStateResult::Invalid);

    const std::string invalidTarget =
        "{\"v\":2,\"type\":\"state\",\"seq\":1,\"phase\":\"following\",\"tb\":360,"
        "\"md\":0,\"c\":\"credible\",\"m\":[],\"a\":[],\"r\":false,\"ts\":1}\n";
    assert(parseBoardState(invalidTarget, state) == physical_compass::ParseStateResult::Invalid);
    const std::string invalidDeclination =
        "{\"v\":2,\"type\":\"state\",\"seq\":1,\"phase\":\"following\",\"tb\":0,"
        "\"md\":180.1,\"c\":\"credible\",\"m\":[],\"a\":[],\"r\":false,\"ts\":1}\n";
    assert(parseBoardState(invalidDeclination, state) == physical_compass::ParseStateResult::Invalid);

    const std::string duplicateAction =
        "{\"v\":2,\"type\":\"state\",\"seq\":1,\"phase\":\"following\","
        "\"c\":\"credible\",\"m\":[],\"a\":[\"stop\",\"stop\"],\"r\":false,\"ts\":1}\n";
    assert(parseBoardState(duplicateAction, state) == physical_compass::ParseStateResult::Invalid);
    assert(state.sequence == 99);

    std::string korean40;
    for (int index = 0; index < 40; ++index) korean40 += u8"가";
    const std::string unicodeFrame =
        "{\"v\":2,\"type\":\"state\",\"seq\":10,\"phase\":\"following\","
        "\"c\":\"credible\",\"m\":[\"" + korean40 +
        "\"],\"a\":[],\"r\":false,\"ts\":1}\n";
    assert(parseBoardState(unicodeFrame, state) == physical_compass::ParseStateResult::Accepted);
    assert(strlen(state.menus[0]) == 120);
    const std::string unicodeOverflowFrame =
        "{\"v\":2,\"type\":\"state\",\"seq\":11,\"phase\":\"following\","
        "\"c\":\"credible\",\"m\":[\"" + korean40 + u8"가" +
        "\"],\"a\":[],\"r\":false,\"ts\":1}\n";
    assert(parseBoardState(unicodeOverflowFrame, state) == physical_compass::ParseStateResult::Invalid);
    std::string combiningText;
    for (int index = 0; index < 21; ++index) combiningText += u8"e\u0301";
    const std::string combiningOverflowFrame =
        "{\"v\":2,\"type\":\"state\",\"seq\":12,\"phase\":\"following\","
        "\"c\":\"credible\",\"m\":[\"" + combiningText +
        "\"],\"a\":[],\"r\":false,\"ts\":1}\n";
    assert(parseBoardState(combiningOverflowFrame, state) == physical_compass::ParseStateResult::Invalid);

    std::string maximumFrame = suppressed;
    maximumFrame.pop_back();
    maximumFrame.append(physical_compass::kMaxFrameBytes - maximumFrame.size() - 1, ' ');
    maximumFrame.push_back('\n');
    assert(maximumFrame.size() == physical_compass::kMaxFrameBytes);
    assert(parseBoardState(maximumFrame, state) == physical_compass::ParseStateResult::Accepted);
    maximumFrame.insert(maximumFrame.end() - 1, ' ');
    assert(parseBoardState(maximumFrame, state) == physical_compass::ParseStateResult::Invalid);

    char eventFrame[128] = {};
    const size_t eventLength = physical_compass::encodeEvent(
        "stop",
        7,
        eventFrame,
        sizeof(eventFrame)
    );
    assert(eventLength > 0);
    assert(eventFrame[eventLength - 1] == '\n');
    assert(strstr(eventFrame, "\"v\":2") != nullptr);
    assert(strstr(eventFrame, "\"type\":\"event\"") != nullptr);
    assert(strstr(eventFrame, "\"action\":\"stop\"") != nullptr);
    assert(strstr(eventFrame, "\"seq\":7") != nullptr);
    char tinyEventFrame[8] = {};
    assert(physical_compass::encodeEvent(
        "stop",
        7,
        tinyEventFrame,
        sizeof(tinyEventFrame)
    ) == 0);
    assert(physical_compass::encodeEvent(
        "unknown",
        7,
        eventFrame,
        sizeof(eventFrame)
    ) == 0);
}

static void assertRuntimeInputEquals(
    const roll_compass::RuntimeInput &actual,
    const roll_compass::RuntimeInput &expected
) {
    assert(actual.bootComplete == expected.bootComplete);
    assert(actual.bleConnected == expected.bleConnected);
    assert(actual.protocolMismatch == expected.protocolMismatch);
    assert(actual.snapshotFresh == expected.snapshotFresh);
    assert(actual.sensorHealth == expected.sensorHealth);
    assert(actual.calibrationHealth == expected.calibrationHealth);
    assert(actual.phase == expected.phase);
    assert(actual.hasCredibleTarget == expected.hasCredibleTarget);
    assertNear(actual.targetTrueBearingDegrees, expected.targetTrueBearingDegrees);
    assertNear(actual.magneticDeclinationDegreesEast, expected.magneticDeclinationDegreesEast);
    assertNear(actual.boardMagneticHeadingDegrees, expected.boardMagneticHeadingDegrees);
    assert(actual.hasDistance == expected.hasDistance);
    assertNear(actual.distanceM, expected.distanceM);
    assert(actual.actionMask == expected.actionMask);
}

static void assertDiagnosticParsing() {
    using roll_compass::DiagnosticCommandType;
    assert(roll_compass::parseDiagnosticCommand("sim on").type == DiagnosticCommandType::SimOn);
    assert(roll_compass::parseDiagnosticCommand("sim off").type == DiagnosticCommandType::SimOff);
    assert(roll_compass::parseDiagnosticCommand("state guiding").type == DiagnosticCommandType::StateGuiding);
    assert(roll_compass::parseDiagnosticCommand("state near").type == DiagnosticCommandType::StateNear);
    assert(roll_compass::parseDiagnosticCommand("state paused").type == DiagnosticCommandType::StatePaused);
    assert(roll_compass::parseDiagnosticCommand("state arrived").type == DiagnosticCommandType::StateArrived);
    assert(roll_compass::parseDiagnosticCommand("state calibrating").type == DiagnosticCommandType::StateCalibrating);
    assert(roll_compass::parseDiagnosticCommand("state sensor-missing").type == DiagnosticCommandType::StateSensorMissing);
    assert(roll_compass::parseDiagnosticCommand("state anomaly").type == DiagnosticCommandType::StateAnomaly);

    const auto heading = roll_compass::parseDiagnosticCommand("heading 90");
    assert(heading.type == DiagnosticCommandType::Heading);
    assertNear(heading.valueDegrees, 90.0f);
    assert(roll_compass::parseDiagnosticCommand("heading 0").type == DiagnosticCommandType::Heading);
    assert(roll_compass::parseDiagnosticCommand("heading 359.999").type == DiagnosticCommandType::Heading);
    assert(roll_compass::parseDiagnosticCommand("target 315").type == DiagnosticCommandType::Target);
    assert(roll_compass::parseDiagnosticCommand("target 359.999").type == DiagnosticCommandType::Target);
    assert(roll_compass::parseDiagnosticCommand("declination -180").type == DiagnosticCommandType::Declination);
    assert(roll_compass::parseDiagnosticCommand("declination 180").type == DiagnosticCommandType::Declination);
    assert(roll_compass::parseDiagnosticCommand("sweep cw").type == DiagnosticCommandType::SweepClockwise);
    assert(roll_compass::parseDiagnosticCommand("sweep ccw").type == DiagnosticCommandType::SweepCounterClockwise);
    assert(roll_compass::parseDiagnosticCommand("sweep stop").type == DiagnosticCommandType::SweepStop);

    const char *const invalidCommands[] = {
        nullptr,
        "",
        "sim  on",
        " sim on",
        "sim on ",
        "sim\ton",
        "sim on now",
        "heading",
        "heading 90 extra",
        "heading nan",
        "heading inf",
        "heading -0.001",
        "heading 360",
        "target -1",
        "target 360",
        "declination -180.001",
        "declination 180.001",
        "declination NaN",
        "sweep clockwise",
        "state Guiding",
        "state unknown",
        "sim on\n",
    };
    for (const char *command : invalidCommands) {
        assert(roll_compass::parseDiagnosticCommand(command).type == DiagnosticCommandType::Invalid);
    }
}

static void assertDiagnosticStateInjection() {
    using roll_compass::DiagnosticCommandType;
    roll_compass::DiagnosticState diagnostic;
    auto realInput = credibleGuidanceInput();
    realInput.protocolMismatch = true;
    const auto untouched = realInput;
    diagnostic.applyTo(realInput, 1000);
    assertRuntimeInputEquals(realInput, untouched);

    assert(roll_compass::applyDiagnosticCommand(
        roll_compass::parseDiagnosticCommand("target 315"),
        diagnostic
    ));
    assert(roll_compass::applyDiagnosticCommand(
        roll_compass::parseDiagnosticCommand("declination -8.2"),
        diagnostic
    ));
    assert(!diagnostic.enabled());
    realInput = untouched;
    diagnostic.applyTo(realInput, 2000);
    assertRuntimeInputEquals(realInput, untouched);

    assert(roll_compass::applyDiagnosticCommand(
        roll_compass::parseDiagnosticCommand("heading 90"),
        diagnostic
    ));
    assert(diagnostic.enabled());
    roll_compass::RuntimeInput simulated{};
    diagnostic.applyTo(simulated, 3000);
    assert(simulated.bootComplete);
    assert(simulated.bleConnected);
    assert(!simulated.protocolMismatch);
    assert(simulated.snapshotFresh);
    assert(simulated.sensorHealth == roll_compass::SensorHealth::Ready);
    assert(simulated.calibrationHealth == roll_compass::CalibrationHealth::Valid);
    assert(simulated.phase == roll_compass::JourneyPhase::Following);
    assert(simulated.hasCredibleTarget);
    assertNear(simulated.targetTrueBearingDegrees, 315.0f);
    assertNear(simulated.magneticDeclinationDegreesEast, -8.2f);
    assertNear(simulated.boardMagneticHeadingDegrees, 90.0f);
    assert(!simulated.hasDistance);
    assert(simulated.actionMask == (1U << 0));

    const struct {
        const char *command;
        roll_compass::JourneyPhase phase;
        roll_compass::SensorHealth sensor;
        roll_compass::CalibrationHealth calibration;
        uint8_t actionMask;
    } stateCases[] = {
        {"state guiding", roll_compass::JourneyPhase::Following, roll_compass::SensorHealth::Ready, roll_compass::CalibrationHealth::Valid, 1U << 0},
        {"state near", roll_compass::JourneyPhase::Near, roll_compass::SensorHealth::Ready, roll_compass::CalibrationHealth::Valid, 1U << 0},
        {"state paused", roll_compass::JourneyPhase::Paused, roll_compass::SensorHealth::Ready, roll_compass::CalibrationHealth::Valid, static_cast<uint8_t>((1U << 1) | (1U << 2))},
        {"state arrived", roll_compass::JourneyPhase::Arrived, roll_compass::SensorHealth::Ready, roll_compass::CalibrationHealth::Valid, 1U << 3},
        {"state calibrating", roll_compass::JourneyPhase::Following, roll_compass::SensorHealth::Ready, roll_compass::CalibrationHealth::Collecting, 1U << 0},
        {"state sensor-missing", roll_compass::JourneyPhase::Following, roll_compass::SensorHealth::Missing, roll_compass::CalibrationHealth::Missing, 1U << 0},
        {"state anomaly", roll_compass::JourneyPhase::Following, roll_compass::SensorHealth::Anomaly, roll_compass::CalibrationHealth::Valid, 1U << 0},
    };
    for (const auto &stateCase : stateCases) {
        assert(roll_compass::applyDiagnosticCommand(
            roll_compass::parseDiagnosticCommand(stateCase.command),
            diagnostic
        ));
        diagnostic.applyTo(simulated, 4000);
        assert(simulated.phase == stateCase.phase);
        assert(simulated.sensorHealth == stateCase.sensor);
        assert(simulated.calibrationHealth == stateCase.calibration);
        assert(simulated.actionMask == stateCase.actionMask);
    }

    assert(roll_compass::applyDiagnosticCommand(
        roll_compass::parseDiagnosticCommand("sim off"),
        diagnostic
    ));
    assert(!diagnostic.enabled());
    realInput = untouched;
    diagnostic.applyTo(realInput, 5000);
    assertRuntimeInputEquals(realInput, untouched);
    assert(!roll_compass::applyDiagnosticCommand(
        roll_compass::DiagnosticCommand{DiagnosticCommandType::Invalid, 0.0f},
        diagnostic
    ));
}

static void assertDiagnosticSweep() {
    roll_compass::DiagnosticState diagnostic;
    assert(roll_compass::applyDiagnosticCommand(
        roll_compass::parseDiagnosticCommand("sim on"),
        diagnostic
    ));
    assert(roll_compass::applyDiagnosticCommand(
        roll_compass::parseDiagnosticCommand("sweep cw"),
        diagnostic
    ));
    roll_compass::RuntimeInput input{};
    diagnostic.applyTo(input, 1000);
    assertNear(input.boardMagneticHeadingDegrees, 0.0f);
    diagnostic.applyTo(input, 2000);
    assertNear(input.boardMagneticHeadingDegrees, 45.0f);
    assert(roll_compass::applyDiagnosticCommand(
        roll_compass::parseDiagnosticCommand("sweep stop"),
        diagnostic
    ));
    diagnostic.applyTo(input, 8000);
    assertNear(input.boardMagneticHeadingDegrees, 45.0f);

    assert(roll_compass::applyDiagnosticCommand(
        roll_compass::parseDiagnosticCommand("sweep ccw"),
        diagnostic
    ));
    diagnostic.applyTo(input, 9000);
    assertNear(input.boardMagneticHeadingDegrees, 45.0f);
    diagnostic.applyTo(input, 10000);
    assertNear(input.boardMagneticHeadingDegrees, 0.0f);
    assert(roll_compass::applyDiagnosticCommand(
        roll_compass::parseDiagnosticCommand("heading 120"),
        diagnostic
    ));
    diagnostic.applyTo(input, 11000);
    assertNear(input.boardMagneticHeadingDegrees, 120.0f);
    diagnostic.applyTo(input, 12000);
    assertNear(input.boardMagneticHeadingDegrees, 120.0f);

    assert(roll_compass::applyDiagnosticCommand(
        roll_compass::parseDiagnosticCommand("sim on"),
        diagnostic
    ));
    assert(roll_compass::applyDiagnosticCommand(
        roll_compass::parseDiagnosticCommand("sweep cw"),
        diagnostic
    ));
    diagnostic.applyTo(input, UINT32_MAX - 500U);
    assertNear(input.boardMagneticHeadingDegrees, 0.0f);
    diagnostic.applyTo(input, 499U);
    assertNear(input.boardMagneticHeadingDegrees, 45.0f);
}

static void assertCircularLayoutContainment() {
    assert(roll_compass::rectFitsCircle(roll_compass::kBrandBounds, 240, 240, 214));
    assert(roll_compass::rectFitsCircle(roll_compass::kStatusBounds, 240, 240, 214));
    assert(roll_compass::rectFitsCircle(roll_compass::kDistanceBounds, 240, 240, 214));
    assert(roll_compass::rectFitsCircle(roll_compass::kPrimaryActionBounds, 240, 240, 214));
    assert(roll_compass::rectFitsCircle(roll_compass::kPausedContinueBounds, 240, 240, 214));
    assert(roll_compass::rectFitsCircle(roll_compass::kPausedEndBounds, 240, 240, 214));
}

static void assertDisplayBufferPreference() {
    using roll_compass::DisplayBufferPreference;

    assert(roll_compass::displayBufferPreference(1'310'719U, 1'310'720U) ==
        DisplayBufferPreference::Partial);
    assert(roll_compass::displayBufferPreference(1'310'720U, 1'310'720U) ==
        DisplayBufferPreference::DirectDouble);
}

static void assertScreenPowerButtonRespondsOnPressEdge() {
    using roll_compass::ScreenPowerButton;
    using roll_compass::ScreenPowerButtonEvent;

    ScreenPowerButton button(20U);
    button.reset(false, 100U);
    assert(button.update(true, 110U) == ScreenPowerButtonEvent::Pressed);
    assert(button.update(false, 111U) == ScreenPowerButtonEvent::None);
    assert(button.update(true, 115U) == ScreenPowerButtonEvent::None);
    assert(button.update(true, 500U) == ScreenPowerButtonEvent::None);

    assert(button.update(false, 510U) == ScreenPowerButtonEvent::None);
    assert(button.update(false, 529U) == ScreenPowerButtonEvent::None);
    assert(button.update(false, 530U) == ScreenPowerButtonEvent::None);
    assert(button.update(true, 531U) == ScreenPowerButtonEvent::Pressed);

    button.reset(true, 1'000U);
    assert(button.update(true, 2'000U) == ScreenPowerButtonEvent::None);
    assert(button.update(false, 2'010U) == ScreenPowerButtonEvent::None);
    assert(button.update(false, 2'029U) == ScreenPowerButtonEvent::None);
    assert(button.update(false, 2'030U) == ScreenPowerButtonEvent::None);
    assert(button.update(true, 2'031U) == ScreenPowerButtonEvent::Pressed);

    button.reset(true, UINT32_MAX - 20U);
    assert(button.update(false, UINT32_MAX - 10U) == ScreenPowerButtonEvent::None);
    assert(button.update(false, 9U) == ScreenPowerButtonEvent::None);
    assert(button.update(true, 10U) == ScreenPowerButtonEvent::Pressed);
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

    assertRuntimePrecedence();
    assertRuntimePhaseMappingAndSuppression();
    assertWirePhaseMapping();
    assertStrictBleV2Parsing();
    assertDiagnosticParsing();
    assertDiagnosticStateInjection();
    assertDiagnosticSweep();
    assertCircularLayoutContainment();
    assertDisplayBufferPreference();
    assertScreenPowerButtonRespondsOnPressEdge();
    return 0;
}
