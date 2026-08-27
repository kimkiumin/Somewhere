#pragma once

#include <stddef.h>
#include <stdint.h>

namespace physical_compass {

constexpr uint8_t kContractVersion = 2;
constexpr size_t kMaxFrameBytes = 512;
constexpr size_t kMaxDisplayCharacters = 40;
constexpr size_t kMaxDisplayBytes = kMaxDisplayCharacters * 4;
constexpr char kServiceUuid[] = "C1F8A100-35D1-4C53-9A03-7A1B3E620001";
constexpr char kStateCharacteristicUuid[] = "C1F8A101-35D1-4C53-9A03-7A1B3E620001";
constexpr char kEventCharacteristicUuid[] = "C1F8A102-35D1-4C53-9A03-7A1B3E620001";
constexpr char kAdvertisedName[] = "Roll Compass";

struct BoardState {
    uint32_t sequence = 0;
    char phase[kMaxDisplayBytes + 1] = {};
    bool hasDistance = false;
    float distanceM = 0.0f;
    bool hasDirection = false;
    float targetTrueBearingDegrees = 0.0f;
    float magneticDeclinationDegreesEast = 0.0f;
    char confidence[kMaxDisplayBytes + 1] = "disconnected";
    char menus[2][kMaxDisplayBytes + 1] = {};
    uint8_t menuCount = 0;
    char priceBand[kMaxDisplayBytes + 1] = {};
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

enum class ParseStateResult : uint8_t { Accepted, Invalid, UnsupportedVersion };

ParseStateResult parseStateFrame(const uint8_t *data, size_t length, BoardState &state);
size_t encodeEvent(
    const char *action,
    uint32_t sequence,
    char *output,
    size_t outputCapacity
);
bool hasAction(const BoardState &state, const char *action);
uint8_t actionIndex(const char *action);

}  // namespace physical_compass
