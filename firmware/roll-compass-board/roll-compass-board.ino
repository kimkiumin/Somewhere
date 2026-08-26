#include "board_config.h"

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <esp_display_panel.hpp>
#include <lvgl.h>
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
physical_compass::BoardState currentState;

void queueStateChunk(const uint8_t *data, size_t length) {
    if (pendingStateMutex == nullptr || data == nullptr || length == 0 || length > physical_compass::kMaxFrameBytes) return;
    if (xSemaphoreTake(pendingStateMutex, pdMS_TO_TICKS(10)) != pdTRUE) return;
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
    }
    xSemaphoreGive(pendingStateMutex);
}

class ServerCallbacks final : public BLEServerCallbacks {
    void onConnect(BLEServer *) override {
        bleConnected = true;
    }

    void onDisconnect(BLEServer *) override {
        bleConnected = false;
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
    const String frame = physical_compass::encodeEvent(action, sequence);
    if (frame.isEmpty()) return;
    eventCharacteristic->setValue(reinterpret_cast<const uint8_t *>(frame.c_str()), frame.length());
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
    if (xSemaphoreTake(pendingStateMutex, 0) == pdTRUE) {
        if (pendingStateReady) {
            frame = pendingStateFrame;
            pendingStateFrame = "";
            pendingStateReady = false;
        }
        xSemaphoreGive(pendingStateMutex);
    }
    if (frame.isEmpty()) return;

    physical_compass::BoardState next;
    if (!physical_compass::parseStateFrame(reinterpret_cast<const uint8_t *>(frame.c_str()), frame.length(), next)) {
        Serial.println("BLE state rejected");
        return;
    }
    currentState = next;
    displayUiSetState(currentState);
    Serial.printf("BLE state: seq=%lu phase=%s confidence=%s\n", static_cast<unsigned long>(currentState.sequence), currentState.phase.c_str(), currentState.confidence.c_str());
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
    displayUiBegin();
    initializeBle();
    displayUiSetConnection(false);
    Serial.println("Ready: connect from the Somewhere iPhone app");
}

void loop() {
    applyPendingState();
    displayUiSetConnection(bleConnected);
    displayUiTick(millis());
    delay(50);
}
