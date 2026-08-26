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
volatile bool bleConnected = false;
physical_compass::BoardSession boardSession;

class ServerCallbacks final : public BLEServerCallbacks {
    void onConnect(BLEServer *) override {
        if (pendingStateMutex != nullptr && xSemaphoreTake(pendingStateMutex, portMAX_DELAY) != pdTRUE) return;
        boardSession.beginConnection();
        bleConnected = true;
        if (pendingStateMutex != nullptr) xSemaphoreGive(pendingStateMutex);
        displayUiSetConnection(true);
    }

    void onDisconnect(BLEServer *) override {
        if (pendingStateMutex != nullptr && xSemaphoreTake(pendingStateMutex, portMAX_DELAY) != pdTRUE) return;
        boardSession.disconnect();
        bleConnected = false;
        if (pendingStateMutex != nullptr) xSemaphoreGive(pendingStateMutex);
        displayUiSetConnection(false);
        BLEDevice::startAdvertising();
    }
};

class StateCallbacks final : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *characteristic) override {
        const String value = characteristic->getValue();
        if (pendingStateMutex == nullptr || value.isEmpty()) return;
        if (xSemaphoreTake(pendingStateMutex, pdMS_TO_TICKS(10)) != pdTRUE) return;
        boardSession.appendStateChunk(reinterpret_cast<const uint8_t *>(value.c_str()), value.length());
        xSemaphoreGive(pendingStateMutex);
    }
};

void sendPhysicalCompassEvent(const char *action, uint32_t sequence) {
    if (!bleConnected || eventCharacteristic == nullptr) return;
    const std::string frame = physical_compass::encodeEvent(action, sequence);
    if (frame.empty()) return;
    const uint16_t connectionId = bleServer == nullptr ? 0 : bleServer->getConnId();
    const uint16_t negotiatedMtu = bleServer == nullptr ? 0 : bleServer->getPeerMTU(connectionId);
    const std::vector<std::string> chunks = physical_compass::chunkEventFrame(frame, negotiatedMtu);
    for (const std::string &chunk : chunks) {
        eventCharacteristic->setValue(reinterpret_cast<const uint8_t *>(chunk.data()), chunk.size());
        eventCharacteristic->notify();
    }
    Serial.printf("BLE event: %s\n", action);
}

void onTouchAction(const char *action, uint32_t sequence) {
    bool allowed = false;
    if (pendingStateMutex != nullptr && xSemaphoreTake(pendingStateMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
        allowed = boardSession.canEmitAction(action, sequence, millis());
        xSemaphoreGive(pendingStateMutex);
    }
    if (allowed) {
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
    physical_compass::BoardState next;
    bool accepted = false;
    if (xSemaphoreTake(pendingStateMutex, 0) == pdTRUE) {
        accepted = boardSession.takePendingState(millis(), next);
        xSemaphoreGive(pendingStateMutex);
    }
    if (!accepted) return;

    displayUiSetState(next);
    Serial.printf("BLE state: seq=%lu phase=%s confidence=%s\n", static_cast<unsigned long>(next.sequence), next.phase.c_str(), next.confidence.c_str());
}

}  // namespace

void setup() {
    Serial.begin(115200);
    delay(250);
    Serial.println("Roll Compass board boot");

    pendingStateMutex = xSemaphoreCreateMutex();
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
