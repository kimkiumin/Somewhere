#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace physical_compass {

constexpr uint8_t kContractVersion = 1;
constexpr size_t kMaxFrameBytes = 512;
constexpr size_t kMaxDisplayBytes = 40;
constexpr size_t kMaxReassemblyBytes = kMaxFrameBytes * 2;
constexpr size_t kFallbackAttPayloadBytes = 20;
constexpr size_t kAttProtocolOverheadBytes = 3;
constexpr uint64_t kStaleAfterMs = 6000;

constexpr char kServiceUuid[] = "C1F8A100-35D1-4C53-9A03-7A1B3E620001";
constexpr char kStateCharacteristicUuid[] = "C1F8A101-35D1-4C53-9A03-7A1B3E620001";
constexpr char kEventCharacteristicUuid[] = "C1F8A102-35D1-4C53-9A03-7A1B3E620001";
constexpr char kAdvertisedName[] = "Roll Compass";

enum ActionIndex : uint8_t {
    kStop = 0,
    kContinue = 1,
    kConfirmStop = 2,
    kReveal = 3,
    kActionCount = 4,
};

struct BoardState {
    uint32_t sequence = 0;
    std::string phase;
    bool hasDistance = false;
    float distanceM = 0;
    bool hasBearing = false;
    float bearingDegrees = 0;
    std::string confidence = "disconnected";
    std::string menus[2];
    uint8_t menuCount = 0;
    std::string priceBand;
    bool revealed = false;
    bool actions[kActionCount] = {false, false, false, false};
    uint64_t timestampMs = 0;
};

struct BoardEvent {
    std::string action;
    uint32_t sequence = 0;
};

bool isValidUtf8(const uint8_t *data, size_t length);
bool isValidUtf8(const std::string &value);
bool isValidDisplayText(const std::string &value);
std::string truncateDisplayText(const std::string &value);

uint8_t actionIndex(const char *action);
bool hasAction(const BoardState &state, const char *action);

bool parseStateFrame(const uint8_t *data, size_t length, BoardState &state);
std::string encodeEvent(const char *action, uint32_t sequence);
bool decodeEventFrame(const uint8_t *data, size_t length, BoardEvent &event);

class LineReassembler {
public:
    std::vector<std::string> appendChunk(const uint8_t *data, size_t length);
    void clear();

private:
    std::string buffer_;
    bool discardUntilNewline_ = false;
};

std::vector<std::string> chunkEventFrame(const std::string &frame, uint16_t negotiatedMtu);

class BoardSession {
public:
    void beginConnection();
    void disconnect();
    void appendStateChunk(const uint8_t *data, size_t length);
    bool takePendingState(uint64_t receivedAtMs, BoardState &state);
    bool hasFreshState(uint64_t nowMs) const;
    bool canEmitAction(const char *action, uint32_t sequence, uint64_t nowMs) const;
    const BoardState &acceptedState() const;
    uint64_t connectionEpoch() const;

private:
    void clearState();

    uint64_t connectionEpoch_ = 0;
    bool connected_ = false;
    LineReassembler reassembler_;
    BoardState pendingState_;
    bool hasPendingState_ = false;
    BoardState acceptedState_;
    bool hasAcceptedState_ = false;
    uint32_t highestSequence_ = 0;
    uint64_t acceptedAtMs_ = 0;
};

}  // namespace physical_compass
