#include "board_config.h"

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <esp_display_panel.hpp>
#include <lvgl.h>
#include "compass_runtime.h"
#include "display_ui.h"
#include "lvgl_v8_port.h"
#include "physical_compass_wire.h"

using namespace esp_panel::board;
using namespace esp_panel::drivers;

namespace {

BLEServer *bleServer = nullptr;
BLECharacteristic *stateCharacteristic = nullptr;
BLECharacteristic *eventCharacteristic = nullptr;
SemaphoreHandle_t pendingStateMutex = nullptr;
String pendingStateFrame;
String stateReassemblyBuffer;
bool pendingStateReady = false;
volatile bool bleConnected = false;
uint32_t connectionEpoch = 0;
uint32_t pendingStateEpoch = 0;
bool bootComplete = false;
bool protocolMismatch = false;
volatile uint32_t lastSnapshotMs = 0;
physical_compass::BoardState currentState;

void clearPendingStateBuffersLocked() {
    lastSnapshotMs = 0;
    pendingStateFrame = "";
    stateReassemblyBuffer = "";
    pendingStateReady = false;
    pendingStateEpoch = connectionEpoch;
}

void setBleConnectionState(bool connected) {
    if (pendingStateMutex == nullptr) {
        ++connectionEpoch;
        bleConnected = connected;
        lastSnapshotMs = 0;
        return;
    }
    if (xSemaphoreTake(pendingStateMutex, portMAX_DELAY) != pdTRUE) return;
    ++connectionEpoch;
    bleConnected = connected;
    protocolMismatch = false;
    clearPendingStateBuffersLocked();
    xSemaphoreGive(pendingStateMutex);
}

uint8_t currentActionMask() {
    uint8_t mask = 0;
    for (uint8_t index = 0; index < 5; ++index) {
        if (currentState.actions[index]) mask |= static_cast<uint8_t>(1U << index);
    }
    return mask;
}

void renderRuntime(uint32_t nowMs) {
    roll_compass::RuntimeInput input;
    input.bootComplete = bootComplete;
    input.bleConnected = bleConnected;
    input.protocolMismatch = protocolMismatch;
    input.snapshotFresh = lastSnapshotMs != 0 && nowMs - lastSnapshotMs < 6000;
    input.sensorHealth = roll_compass::SensorHealth::Missing;
    input.calibrationHealth = roll_compass::CalibrationHealth::Missing;
    input.phase = roll_compass::journeyPhaseFromWire(currentState.phase);
    input.hasCredibleTarget = currentState.hasDirection && strcmp(currentState.confidence, "credible") == 0;
    input.targetTrueBearingDegrees = currentState.targetTrueBearingDegrees;
    input.magneticDeclinationDegreesEast = currentState.magneticDeclinationDegreesEast;
    input.hasDistance = currentState.hasDistance;
    input.distanceM = currentState.distanceM;
    input.actionMask = currentActionMask();
    displayUiSetRuntime(currentState, roll_compass::reduceRuntime(input));
}

void queueStateChunk(const uint8_t *data, size_t length) {
    if (pendingStateMutex == nullptr || data == nullptr || length == 0 || length > physical_compass::kMaxFrameBytes) return;
    if (xSemaphoreTake(pendingStateMutex, pdMS_TO_TICKS(10)) != pdTRUE) return;
    if (!bleConnected) {
        xSemaphoreGive(pendingStateMutex);
        return;
    }
    if (stateReassemblyBuffer.length() + length > physical_compass::kMaxFrameBytes) {
        stateReassemblyBuffer = "";
    }
    stateReassemblyBuffer.reserve(physical_compass::kMaxFrameBytes);
    for (size_t index = 0; index < length; ++index) {
        stateReassemblyBuffer += static_cast<char>(data[index]);
    }

    int newlineIndex = stateReassemblyBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
        const String completeFrame = stateReassemblyBuffer.substring(0, newlineIndex);
        stateReassemblyBuffer.remove(0, newlineIndex + 1);
        newlineIndex = stateReassemblyBuffer.indexOf('\n');
        if (completeFrame.isEmpty()) continue;

        pendingStateFrame = completeFrame;
        pendingStateFrame.reserve(physical_compass::kMaxFrameBytes);
        pendingStateReady = true;
        pendingStateEpoch = connectionEpoch;
    }
    xSemaphoreGive(pendingStateMutex);
}

class ServerCallbacks final : public BLEServerCallbacks {
    void onConnect(BLEServer *) override {
        setBleConnectionState(true);
    }

    void onDisconnect(BLEServer *) override {
        setBleConnectionState(false);
        BLEDevice::startAdvertising();
    }
};

class StateCallbacks final : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *characteristic) override {
        const String value = characteristic->getValue();
        queueStateChunk(reinterpret_cast<const uint8_t *>(value.c_str()), value.length());
    }
};

void sendPhysicalCompassEvent(const char *action, uint32_t sequence) {
    if (!bleConnected || eventCharacteristic == nullptr) return;
    char frame[128] = {};
    const size_t frameLength = physical_compass::encodeEvent(
        action,
        sequence,
        frame,
        sizeof(frame)
    );
    if (frameLength == 0) return;
    eventCharacteristic->setValue(reinterpret_cast<const uint8_t *>(frame), frameLength);
    eventCharacteristic->notify();
    Serial.printf("BLE event: %s\n", action);
}

void onTouchAction(const char *action, uint32_t sequence) {
    if (physical_compass::hasAction(currentState, action)) {
        sendPhysicalCompassEvent(action, sequence);
    }
}

void initializeBle() {
    BLEDevice::init(physical_compass::kAdvertisedName);
    BLEDevice::setMTU(517);
    bleServer = BLEDevice::createServer();
    bleServer->setCallbacks(new ServerCallbacks());

    BLEService *service = bleServer->createService(physical_compass::kServiceUuid);
    stateCharacteristic = service->createCharacteristic(
        physical_compass::kStateCharacteristicUuid,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
    );
    stateCharacteristic->setCallbacks(new StateCallbacks());
    eventCharacteristic = service->createCharacteristic(
        physical_compass::kEventCharacteristicUuid,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    service->start();

    BLEAdvertising *advertising = BLEDevice::getAdvertising();
    advertising->addServiceUUID(physical_compass::kServiceUuid);
    advertising->setScanResponse(true);
    advertising->setMinPreferred(0x06);
    advertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();
    Serial.println("BLE advertising: Roll Compass");
}

void applyPendingState() {
    if (pendingStateMutex == nullptr) return;
    String frame;
    uint32_t frameEpoch = 0;
    if (xSemaphoreTake(pendingStateMutex, 0) == pdTRUE) {
        if (pendingStateReady) {
            frame = pendingStateFrame;
            frameEpoch = pendingStateEpoch;
            pendingStateFrame = "";
            pendingStateReady = false;
        }
        xSemaphoreGive(pendingStateMutex);
    }
    if (frame.isEmpty()) return;

    physical_compass::BoardState next;
    const physical_compass::ParseStateResult result = physical_compass::parseStateFrame(
        reinterpret_cast<const uint8_t *>(frame.c_str()),
        frame.length(),
        next
    );
    bool staleConnection = false;
    uint32_t acceptedAtMs = 0;
    if (xSemaphoreTake(pendingStateMutex, portMAX_DELAY) == pdTRUE) {
        staleConnection = !bleConnected || frameEpoch != connectionEpoch;
        if (!staleConnection && result == physical_compass::ParseStateResult::UnsupportedVersion) {
            protocolMismatch = true;
            lastSnapshotMs = 0;
        } else if (!staleConnection && result == physical_compass::ParseStateResult::Accepted) {
            protocolMismatch = false;
            currentState = next;
            acceptedAtMs = millis();
            lastSnapshotMs = acceptedAtMs;
        }
        xSemaphoreGive(pendingStateMutex);
    }
    if (staleConnection) {
        Serial.println("BLE state discarded: connection changed");
        return;
    }
    if (result == physical_compass::ParseStateResult::UnsupportedVersion) {
        Serial.println("BLE state rejected: update required");
        return;
    }
    if (result != physical_compass::ParseStateResult::Accepted) {
        Serial.println("BLE state rejected");
        return;
    }
    renderRuntime(acceptedAtMs);
    Serial.printf(
        "BLE state: seq=%lu phase=%s confidence=%s\n",
        static_cast<unsigned long>(currentState.sequence),
        currentState.phase,
        currentState.confidence
    );
}

}  // namespace

void setup() {
    Serial.begin(115200);
    delay(250);
    Serial.println("Roll Compass board boot");

    pendingStateMutex = xSemaphoreCreateMutex();
    pendingStateFrame.reserve(physical_compass::kMaxFrameBytes);
    stateReassemblyBuffer.reserve(physical_compass::kMaxFrameBytes);
    displayUiSetEventCallback(onTouchAction);

    Serial.println("Initializing display panel");
    Board *board = new Board();
    board->init();
#if LVGL_PORT_AVOID_TEARING_MODE
    board->getLCD()->configFrameBufferNumber(LVGL_PORT_DISP_BUFFER_NUM);
#endif
    assert(board->begin());
    assert(lvgl_port_init(board->getLCD(), board->getTouch()));
    if (lvgl_port_lock(-1)) {
        displayUiBegin();
        lvgl_port_unlock();
    }
    initializeBle();
    bootComplete = true;
    renderRuntime(millis());
    Serial.println("Ready: connect from the Somewhere iPhone app");
}

void loop() {
    applyPendingState();
    const uint32_t nowMs = millis();
    renderRuntime(nowMs);
    displayUiTick(nowMs);
    delay(50);
}
