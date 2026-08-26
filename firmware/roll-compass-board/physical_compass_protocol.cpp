#include "physical_compass_protocol.h"

#include <cerrno>
#include <cmath>
#include <cstdlib>
#include <limits>
#include <map>

namespace physical_compass {

namespace {

enum class JsonKind : uint8_t {
    nullValue,
    boolean,
    number,
    string,
    array,
    object,
};

struct JsonValue {
    JsonKind kind = JsonKind::nullValue;
    bool boolean = false;
    std::string number;
    std::string string;
    std::vector<JsonValue> array;
    std::map<std::string, JsonValue> object;
};

bool appendCodePoint(uint32_t codePoint, std::string &output) {
    if (codePoint > 0x10FFFF || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) return false;
    if (codePoint <= 0x7F) {
        output.push_back(static_cast<char>(codePoint));
    } else if (codePoint <= 0x7FF) {
        output.push_back(static_cast<char>(0xC0 | (codePoint >> 6)));
        output.push_back(static_cast<char>(0x80 | (codePoint & 0x3F)));
    } else if (codePoint <= 0xFFFF) {
        output.push_back(static_cast<char>(0xE0 | (codePoint >> 12)));
        output.push_back(static_cast<char>(0x80 | ((codePoint >> 6) & 0x3F)));
        output.push_back(static_cast<char>(0x80 | (codePoint & 0x3F)));
    } else {
        output.push_back(static_cast<char>(0xF0 | (codePoint >> 18)));
        output.push_back(static_cast<char>(0x80 | ((codePoint >> 12) & 0x3F)));
        output.push_back(static_cast<char>(0x80 | ((codePoint >> 6) & 0x3F)));
        output.push_back(static_cast<char>(0x80 | (codePoint & 0x3F)));
    }
    return true;
}

bool decodeUtf8CodePoint(const uint8_t *data, size_t length, size_t offset, uint32_t &codePoint, size_t &width) {
    if (offset >= length) return false;
    const uint8_t first = data[offset];
    if (first <= 0x7F) {
        codePoint = first;
        width = 1;
        return true;
    }

    if (first >= 0xC2 && first <= 0xDF) {
        width = 2;
        codePoint = first & 0x1F;
    } else if (first >= 0xE0 && first <= 0xEF) {
        width = 3;
        codePoint = first & 0x0F;
    } else if (first >= 0xF0 && first <= 0xF4) {
        width = 4;
        codePoint = first & 0x07;
    } else {
        return false;
    }

    if (offset + width > length) return false;
    for (size_t index = 1; index < width; ++index) {
        const uint8_t continuation = data[offset + index];
        if ((continuation & 0xC0) != 0x80) return false;
        codePoint = (codePoint << 6) | (continuation & 0x3F);
    }

    if ((width == 2 && codePoint < 0x80) ||
        (width == 3 && codePoint < 0x800) ||
        (width == 4 && codePoint < 0x10000) ||
        (codePoint >= 0xD800 && codePoint <= 0xDFFF) ||
        codePoint > 0x10FFFF) {
        return false;
    }
    return true;
}

class JsonParser {
public:
    JsonParser(const uint8_t *data, size_t length) : data_(data), length_(length) {}

    bool parse(JsonValue &value) {
        skipWhitespace();
        if (!parseValue(value)) return false;
        skipWhitespace();
        return position_ == length_;
    }

private:
    void skipWhitespace() {
        while (position_ < length_) {
            const uint8_t value = data_[position_];
            if (value != ' ' && value != '\t' && value != '\n' && value != '\r') return;
            ++position_;
        }
    }

    bool consume(uint8_t expected) {
        if (position_ >= length_ || data_[position_] != expected) return false;
        ++position_;
        return true;
    }

    bool parseValue(JsonValue &value) {
        if (position_ >= length_) return false;
        switch (data_[position_]) {
            case 'n': return parseLiteral("null", JsonKind::nullValue, value);
            case 't':
                value.boolean = true;
                return parseLiteral("true", JsonKind::boolean, value);
            case 'f':
                value.boolean = false;
                return parseLiteral("false", JsonKind::boolean, value);
            case '"':
                value.kind = JsonKind::string;
                return parseString(value.string);
            case '[':
                return parseArray(value);
            case '{':
                return parseObject(value);
            default:
                if (data_[position_] == '-' || (data_[position_] >= '0' && data_[position_] <= '9')) {
                    value.kind = JsonKind::number;
                    return parseNumber(value.number);
                }
                return false;
        }
    }

    bool parseLiteral(const char *literal, JsonKind kind, JsonValue &value) {
        size_t offset = 0;
        while (literal[offset] != '\0') {
            if (position_ + offset >= length_ || data_[position_ + offset] != static_cast<uint8_t>(literal[offset])) {
                return false;
            }
            ++offset;
        }
        position_ += offset;
        value.kind = kind;
        return true;
    }

    bool parseNumber(std::string &number) {
        const size_t start = position_;
        if (position_ < length_ && data_[position_] == '-') ++position_;
        if (position_ >= length_) return false;
        if (data_[position_] == '0') {
            ++position_;
        } else {
            if (data_[position_] < '1' || data_[position_] > '9') return false;
            while (position_ < length_ && data_[position_] >= '0' && data_[position_] <= '9') ++position_;
        }
        if (position_ < length_ && data_[position_] == '.') {
            ++position_;
            if (position_ >= length_ || data_[position_] < '0' || data_[position_] > '9') return false;
            while (position_ < length_ && data_[position_] >= '0' && data_[position_] <= '9') ++position_;
        }
        if (position_ < length_ && (data_[position_] == 'e' || data_[position_] == 'E')) {
            ++position_;
            if (position_ < length_ && (data_[position_] == '+' || data_[position_] == '-')) ++position_;
            if (position_ >= length_ || data_[position_] < '0' || data_[position_] > '9') return false;
            while (position_ < length_ && data_[position_] >= '0' && data_[position_] <= '9') ++position_;
        }
        number.assign(reinterpret_cast<const char *>(data_ + start), position_ - start);
        return true;
    }

    bool parseString(std::string &output) {
        if (!consume('"')) return false;
        output.clear();
        while (position_ < length_) {
            const uint8_t value = data_[position_++];
            if (value == '"') return true;
            if (value < 0x20) return false;
            if (value != '\\') {
                uint32_t codePoint = 0;
                size_t width = 0;
                if (!decodeUtf8CodePoint(data_, length_, position_ - 1, codePoint, width)) return false;
                output.append(reinterpret_cast<const char *>(data_ + position_ - 1), width);
                position_ += width - 1;
                continue;
            }

            if (position_ >= length_) return false;
            const uint8_t escaped = data_[position_++];
            switch (escaped) {
                case '"': output.push_back('"'); break;
                case '\\': output.push_back('\\'); break;
                case '/': output.push_back('/'); break;
                case 'b': output.push_back('\b'); break;
                case 'f': output.push_back('\f'); break;
                case 'n': output.push_back('\n'); break;
                case 'r': output.push_back('\r'); break;
                case 't': output.push_back('\t'); break;
                case 'u':
                    if (!parseEscapedCodePoint(output)) return false;
                    break;
                default:
                    return false;
            }
        }
        return false;
    }

    bool parseHexDigit(uint8_t value, uint32_t &digit) {
        if (value >= '0' && value <= '9') digit = value - '0';
        else if (value >= 'a' && value <= 'f') digit = value - 'a' + 10;
        else if (value >= 'A' && value <= 'F') digit = value - 'A' + 10;
        else return false;
        return true;
    }

    bool parseEscapedUnit(uint32_t &unit) {
        if (position_ + 4 > length_) return false;
        unit = 0;
        for (size_t index = 0; index < 4; ++index) {
            uint32_t digit = 0;
            if (!parseHexDigit(data_[position_++], digit)) return false;
            unit = (unit << 4) | digit;
        }
        return true;
    }

    bool parseEscapedCodePoint(std::string &output) {
        uint32_t unit = 0;
        if (!parseEscapedUnit(unit)) return false;
        if (unit >= 0xD800 && unit <= 0xDBFF) {
            if (position_ + 6 > length_ || data_[position_] != '\\' || data_[position_ + 1] != 'u') return false;
            position_ += 2;
            uint32_t low = 0;
            if (!parseEscapedUnit(low) || low < 0xDC00 || low > 0xDFFF) return false;
            unit = 0x10000 + ((unit - 0xD800) << 10) + (low - 0xDC00);
        } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
            return false;
        }
        return appendCodePoint(unit, output);
    }

    bool parseArray(JsonValue &value) {
        if (!consume('[')) return false;
        value.kind = JsonKind::array;
        value.array.clear();
        skipWhitespace();
        if (consume(']')) return true;
        while (true) {
            JsonValue item;
            skipWhitespace();
            if (!parseValue(item)) return false;
            value.array.push_back(item);
            skipWhitespace();
            if (consume(']')) return true;
            if (!consume(',')) return false;
        }
    }

    bool parseObject(JsonValue &value) {
        if (!consume('{')) return false;
        value.kind = JsonKind::object;
        value.object.clear();
        skipWhitespace();
        if (consume('}')) return true;
        while (true) {
            skipWhitespace();
            if (position_ >= length_ || data_[position_] != '"') return false;
            std::string key;
            if (!parseString(key)) return false;
            skipWhitespace();
            if (!consume(':')) return false;
            skipWhitespace();
            JsonValue item;
            if (!parseValue(item)) return false;
            if (!value.object.emplace(key, item).second) return false;
            skipWhitespace();
            if (consume('}')) return true;
            if (!consume(',')) return false;
        }
    }

    const uint8_t *data_;
    size_t length_;
    size_t position_ = 0;
};

bool hasOnlyKnownKeys(const JsonValue &object, const char *const *knownKeys, size_t knownCount) {
    if (object.kind != JsonKind::object) return false;
    for (const auto &entry : object.object) {
        bool known = false;
        for (size_t index = 0; index < knownCount; ++index) {
            if (entry.first == knownKeys[index]) {
                known = true;
                break;
            }
        }
        if (!known) return false;
    }
    return true;
}

const JsonValue *field(const JsonValue &object, const char *key) {
    const auto found = object.object.find(key);
    return found == object.object.end() ? nullptr : &found->second;
}

bool isDigits(const std::string &value) {
    if (value.empty()) return false;
    for (const char character : value) {
        if (character < '0' || character > '9') return false;
    }
    return true;
}

bool parseUnsigned(const JsonValue &value, uint64_t maximum, uint64_t &result) {
    if (value.kind != JsonKind::number || !isDigits(value.number)) return false;
    result = 0;
    for (const char character : value.number) {
        const uint64_t digit = static_cast<uint64_t>(character - '0');
        if (result > (maximum - digit) / 10) return false;
        result = result * 10 + digit;
    }
    return true;
}

bool parseFiniteFloat(const JsonValue &value, float &result) {
    if (value.kind != JsonKind::number) return false;
    errno = 0;
    char *end = nullptr;
    result = std::strtof(value.number.c_str(), &end);
    return errno != ERANGE && end != nullptr && *end == '\0' && std::isfinite(result);
}

bool parseStateJson(const JsonValue &document, BoardState &state) {
    static const char *const knownKeys[] = {
        "v", "type", "seq", "phase", "d", "b", "c", "m", "p", "a", "r", "ts",
    };
    if (!hasOnlyKnownKeys(document, knownKeys, sizeof(knownKeys) / sizeof(knownKeys[0]))) return false;

    const JsonValue *version = field(document, "v");
    const JsonValue *type = field(document, "type");
    const JsonValue *sequence = field(document, "seq");
    const JsonValue *phase = field(document, "phase");
    const JsonValue *confidence = field(document, "c");
    const JsonValue *menus = field(document, "m");
    const JsonValue *actions = field(document, "a");
    const JsonValue *revealed = field(document, "r");
    const JsonValue *timestamp = field(document, "ts");
    if (version == nullptr || type == nullptr || sequence == nullptr || phase == nullptr || confidence == nullptr ||
        menus == nullptr || actions == nullptr || revealed == nullptr || timestamp == nullptr) {
        return false;
    }

    uint64_t parsedNumber = 0;
    if (!parseUnsigned(*version, kContractVersion, parsedNumber) || parsedNumber != kContractVersion) return false;
    if (type->kind != JsonKind::string || type->string != "state") return false;
    if (!parseUnsigned(*sequence, std::numeric_limits<uint32_t>::max(), parsedNumber) || parsedNumber == 0) return false;

    BoardState parsed;
    parsed.sequence = static_cast<uint32_t>(parsedNumber);
    if (phase->kind != JsonKind::string || !isValidDisplayText(phase->string)) return false;
    if (confidence->kind != JsonKind::string || !isValidDisplayText(confidence->string)) return false;
    parsed.phase = phase->string;
    parsed.confidence = confidence->string;

    for (const char *optionalNumber : {"d", "b"}) {
        const JsonValue *value = field(document, optionalNumber);
        if (value == nullptr || value->kind == JsonKind::nullValue) continue;
        float parsedFloat = 0;
        if (!parseFiniteFloat(*value, parsedFloat) || parsedFloat < 0) return false;
        if (optionalNumber[0] == 'd') {
            parsed.hasDistance = true;
            parsed.distanceM = parsedFloat;
        } else {
            if (parsedFloat >= 360) return false;
            parsed.hasBearing = true;
            parsed.bearingDegrees = parsedFloat;
        }
    }

    if (menus->kind != JsonKind::array || menus->array.size() > 2) return false;
    for (const JsonValue &menu : menus->array) {
        if (menu.kind != JsonKind::string || !isValidDisplayText(menu.string)) return false;
        parsed.menus[parsed.menuCount++] = menu.string;
    }

    const JsonValue *price = field(document, "p");
    if (price != nullptr && price->kind != JsonKind::nullValue) {
        if (price->kind != JsonKind::string || !isValidDisplayText(price->string)) return false;
        parsed.priceBand = price->string;
    }

    if (actions->kind != JsonKind::array) return false;
    for (const JsonValue &action : actions->array) {
        if (action.kind != JsonKind::string) return false;
        const uint8_t index = actionIndex(action.string.c_str());
        if (index >= kActionCount || parsed.actions[index]) return false;
        parsed.actions[index] = true;
    }

    if (revealed->kind != JsonKind::boolean) return false;
    parsed.revealed = revealed->boolean;
    if (!parseUnsigned(*timestamp, std::numeric_limits<uint64_t>::max(), parsedNumber)) return false;
    parsed.timestampMs = parsedNumber;
    state = parsed;
    return true;
}

bool parseEventJson(const JsonValue &document, BoardEvent &event) {
    static const char *const knownKeys[] = {"v", "type", "action", "seq"};
    if (!hasOnlyKnownKeys(document, knownKeys, sizeof(knownKeys) / sizeof(knownKeys[0]))) return false;
    const JsonValue *version = field(document, "v");
    const JsonValue *type = field(document, "type");
    const JsonValue *action = field(document, "action");
    const JsonValue *sequence = field(document, "seq");
    uint64_t parsedSequence = 0;
    if (version == nullptr || type == nullptr || action == nullptr || sequence == nullptr ||
        !parseUnsigned(*version, kContractVersion, parsedSequence) || parsedSequence != kContractVersion ||
        type->kind != JsonKind::string || type->string != "event" || action->kind != JsonKind::string ||
        actionIndex(action->string.c_str()) >= kActionCount ||
        !parseUnsigned(*sequence, std::numeric_limits<uint32_t>::max(), parsedSequence) || parsedSequence == 0) {
        return false;
    }
    event.action = action->string;
    event.sequence = static_cast<uint32_t>(parsedSequence);
    return true;
}

bool parseJsonFrame(const uint8_t *data, size_t length, JsonValue &document) {
    if (data == nullptr || length == 0 || length > kMaxFrameBytes) return false;
    if (!isValidUtf8(data, length)) return false;
    if (data[length - 1] == '\n') --length;
    if (length == 0 || length > kMaxFrameBytes - 1) return false;
    for (size_t index = 0; index < length; ++index) {
        if (data[index] == '\n' || data[index] == '\r') return false;
    }
    JsonParser parser(data, length);
    return parser.parse(document);
}

}  // namespace

bool isValidUtf8(const uint8_t *data, size_t length) {
    if (data == nullptr && length != 0) return false;
    size_t offset = 0;
    while (offset < length) {
        uint32_t codePoint = 0;
        size_t width = 0;
        if (!decodeUtf8CodePoint(data, length, offset, codePoint, width)) return false;
        offset += width;
    }
    return true;
}

bool isValidUtf8(const std::string &value) {
    return isValidUtf8(reinterpret_cast<const uint8_t *>(value.data()), value.size());
}

bool isValidDisplayText(const std::string &value) {
    return !value.empty() && value.size() <= kMaxDisplayBytes && isValidUtf8(value);
}

std::string truncateDisplayText(const std::string &value) {
    if (!isValidUtf8(value)) return std::string();
    std::string result;
    size_t offset = 0;
    while (offset < value.size()) {
        uint32_t codePoint = 0;
        size_t width = 0;
        if (!decodeUtf8CodePoint(reinterpret_cast<const uint8_t *>(value.data()), value.size(), offset, codePoint, width)) {
            return std::string();
        }
        if (result.size() + width > kMaxDisplayBytes) break;
        result.append(value, offset, width);
        offset += width;
    }
    return result;
}

uint8_t actionIndex(const char *action) {
    if (action == nullptr) return kActionCount;
    if (std::string(action) == "stop") return kStop;
    if (std::string(action) == "continue") return kContinue;
    if (std::string(action) == "confirm-stop") return kConfirmStop;
    if (std::string(action) == "reveal") return kReveal;
    return kActionCount;
}

bool hasAction(const BoardState &state, const char *action) {
    const uint8_t index = actionIndex(action);
    return index < kActionCount && state.actions[index];
}

bool parseStateFrame(const uint8_t *data, size_t length, BoardState &state) {
    JsonValue document;
    if (!parseJsonFrame(data, length, document)) return false;
    return parseStateJson(document, state);
}

std::string encodeEvent(const char *action, uint32_t sequence) {
    if (sequence == 0 || actionIndex(action) >= kActionCount) return std::string();
    std::string frame = "{\"action\":\"";
    frame += action;
    frame += "\",\"seq\":";
    frame += std::to_string(sequence);
    frame += ",\"type\":\"event\",\"v\":1}\n";
    if (frame.size() > kMaxFrameBytes) return std::string();
    return frame;
}

bool decodeEventFrame(const uint8_t *data, size_t length, BoardEvent &event) {
    JsonValue document;
    if (!parseJsonFrame(data, length, document)) return false;
    return parseEventJson(document, event);
}

std::vector<std::string> LineReassembler::appendChunk(const uint8_t *data, size_t length) {
    std::vector<std::string> frames;
    if (data == nullptr || length == 0 || length > kMaxReassemblyBytes) {
        clear();
        return frames;
    }

    for (size_t index = 0; index < length; ++index) {
        const char byte = static_cast<char>(data[index]);
        if (discardUntilNewline_) {
            if (byte == '\n') discardUntilNewline_ = false;
            continue;
        }
        if (byte == '\n') {
            if (!buffer_.empty() && buffer_.size() + 1 <= kMaxFrameBytes) {
                buffer_.push_back('\n');
                frames.push_back(buffer_);
            }
            buffer_.clear();
            continue;
        }

        if (buffer_.size() + 1 >= kMaxFrameBytes) {
            buffer_.clear();
            discardUntilNewline_ = true;
            continue;
        }
        buffer_.push_back(byte);
        if (buffer_.size() > kMaxReassemblyBytes) {
            buffer_.clear();
            discardUntilNewline_ = true;
        }
    }
    return frames;
}

void LineReassembler::clear() {
    buffer_.clear();
    discardUntilNewline_ = false;
}

std::vector<std::string> chunkEventFrame(const std::string &frame, uint16_t negotiatedMtu) {
    if (frame.empty() || frame.size() > kMaxFrameBytes || frame.back() != '\n') return {};
    for (size_t index = 0; index + 1 < frame.size(); ++index) {
        if (frame[index] == '\n') return {};
    }
    size_t chunkSize = kFallbackAttPayloadBytes;
    if (negotiatedMtu >= kAttProtocolOverheadBytes + 20) {
        chunkSize = negotiatedMtu - kAttProtocolOverheadBytes;
    }
    std::vector<std::string> chunks;
    for (size_t offset = 0; offset < frame.size(); offset += chunkSize) {
        chunks.emplace_back(frame, offset, std::min(chunkSize, frame.size() - offset));
    }
    return chunks;
}

void BoardSession::clearState() {
    reassembler_.clear();
    pendingState_ = BoardState();
    hasPendingState_ = false;
    acceptedState_ = BoardState();
    hasAcceptedState_ = false;
    highestSequence_ = 0;
    acceptedAtMs_ = 0;
}

void BoardSession::beginConnection() {
    ++connectionEpoch_;
    clearState();
    connected_ = true;
}

void BoardSession::disconnect() {
    ++connectionEpoch_;
    connected_ = false;
    clearState();
}

void BoardSession::appendStateChunk(const uint8_t *data, size_t length) {
    if (!connected_) return;
    for (const std::string &frame : reassembler_.appendChunk(data, length)) {
        BoardState parsed;
        if (!parseStateFrame(reinterpret_cast<const uint8_t *>(frame.data()), frame.size(), parsed)) continue;
        if (parsed.sequence <= highestSequence_) continue;
        highestSequence_ = parsed.sequence;
        pendingState_ = parsed;
        hasPendingState_ = true;
    }
}

bool BoardSession::takePendingState(uint64_t receivedAtMs, BoardState &state) {
    if (!hasPendingState_) return false;
    acceptedState_ = pendingState_;
    acceptedAtMs_ = receivedAtMs;
    hasAcceptedState_ = true;
    state = acceptedState_;
    pendingState_ = BoardState();
    hasPendingState_ = false;
    return true;
}

bool BoardSession::hasFreshState(uint64_t nowMs) const {
    return connected_ && hasAcceptedState_ && nowMs >= acceptedAtMs_ && nowMs - acceptedAtMs_ < kStaleAfterMs;
}

bool BoardSession::canEmitAction(const char *action, uint32_t sequence, uint64_t nowMs) const {
    return hasFreshState(nowMs) && sequence > 0 && sequence == acceptedState_.sequence && hasAction(acceptedState_, action);
}

const BoardState &BoardSession::acceptedState() const {
    return acceptedState_;
}

uint64_t BoardSession::connectionEpoch() const {
    return connectionEpoch_;
}

}  // namespace physical_compass
