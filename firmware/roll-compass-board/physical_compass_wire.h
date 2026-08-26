#pragma once

#include <Arduino.h>

namespace physical_compass {

constexpr uint8_t kContractVersion = 1;
constexpr size_t kMaxFrameBytes = 512;
constexpr char kServiceUuid[] = "C1F8A100-35D1-4C53-9A03-7A1B3E620001";
constexpr char kStateCharacteristicUuid[] = "C1F8A101-35D1-4C53-9A03-7A1B3E620001";
constexpr char kEventCharacteristicUuid[] = "C1F8A102-35D1-4C53-9A03-7A1B3E620001";
constexpr char kAdvertisedName[] = "Roll Compass";

struct BoardState {
    uint32_t sequence = 0;
    String phase;
    bool hasDistance = false;
    float distanceM = 0;
    bool hasBearing = false;
    float bearingDegrees = 0;
    String confidence = "disconnected";
    String menus[2];
    uint8_t menuCount = 0;
    String priceBand;
    bool revealed = false;
    bool actions[5] = {false, false, false, false, false};
    uint64_t timestampMs = 0;
};

enum ActionIndex : uint8_t {
    kStop = 0,
    kContinue = 1,
    kConfirmStop = 2,
    kReveal = 3,
    kReview = 4,
};

bool parseStateFrame(const uint8_t *data, size_t length, BoardState &state);
String encodeEvent(const char *action, uint32_t sequence);
bool hasAction(const BoardState &state, const char *action);
uint8_t actionIndex(const char *action);

}  // namespace physical_compass
