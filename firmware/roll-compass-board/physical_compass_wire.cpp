#include "physical_compass_wire.h"

#include <ArduinoJson.h>
#include <math.h>
#include <string.h>

namespace physical_compass {

namespace {

bool validText(const char *value) {
    if (value == nullptr || value[0] == '\0') return false;
    const size_t byteLength = strnlen(value, kMaxDisplayBytes + 1);
    if (byteLength == 0 || byteLength > kMaxDisplayBytes) return false;

    size_t characterCount = 0;
    for (size_t index = 0; index < byteLength;) {
        const uint8_t first = static_cast<uint8_t>(value[index]);
        size_t width = 0;
        if (first <= 0x7F) {
            width = 1;
        } else if (first >= 0xC2 && first <= 0xDF) {
            width = 2;
        } else if (first >= 0xE0 && first <= 0xEF) {
            width = 3;
        } else if (first >= 0xF0 && first <= 0xF4) {
            width = 4;
        } else {
            return false;
        }
        if (index + width > byteLength) return false;
        for (size_t continuation = 1; continuation < width; ++continuation) {
            const uint8_t byte = static_cast<uint8_t>(value[index + continuation]);
            if ((byte & 0xC0) != 0x80) return false;
        }
        if ((first == 0xE0 && static_cast<uint8_t>(value[index + 1]) < 0xA0) ||
            (first == 0xED && static_cast<uint8_t>(value[index + 1]) >= 0xA0) ||
            (first == 0xF0 && static_cast<uint8_t>(value[index + 1]) < 0x90) ||
            (first == 0xF4 && static_cast<uint8_t>(value[index + 1]) >= 0x90)) {
            return false;
        }
        index += width;
        characterCount += 1;
        if (characterCount > kMaxDisplayCharacters) return false;
    }
    return true;
}

bool copyText(JsonVariantConst value, char *destination) {
    if (!value.is<const char *>()) return false;
    const char *raw = value.as<const char *>();
    if (!validText(raw)) return false;
    const size_t length = strlen(raw);
    memcpy(destination, raw, length + 1);
    return true;
}

bool isAllowedStateKey(const char *key) {
    if (key == nullptr) return false;
    return strcmp(key, "v") == 0 || strcmp(key, "type") == 0 ||
        strcmp(key, "seq") == 0 || strcmp(key, "phase") == 0 ||
        strcmp(key, "d") == 0 || strcmp(key, "tb") == 0 || strcmp(key, "md") == 0 ||
        strcmp(key, "c") == 0 || strcmp(key, "m") == 0 || strcmp(key, "p") == 0 ||
        strcmp(key, "a") == 0 || strcmp(key, "r") == 0 || strcmp(key, "ts") == 0;
}

bool containsOnlyStateKeys(JsonObjectConst object) {
    for (JsonPairConst pair : object) {
        if (!isAllowedStateKey(pair.key().c_str())) return false;
    }
    return true;
}

bool hasKey(JsonObjectConst object, const char *key) {
    for (JsonPairConst pair : object) {
        if (strcmp(pair.key().c_str(), key) == 0) return true;
    }
    return false;
}

bool validFiniteNumber(JsonVariantConst value, float minimum, float maximum, bool maximumInclusive) {
    if (!value.is<float>()) return false;
    const float number = value.as<float>();
    if (!isfinite(number) || number < minimum) return false;
    return maximumInclusive ? number <= maximum : number < maximum;
}

}  // namespace

uint8_t actionIndex(const char *action) {
    if (action == nullptr) return 255;
    if (strcmp(action, "stop") == 0) return kStop;
    if (strcmp(action, "continue") == 0) return kContinue;
    if (strcmp(action, "confirm-stop") == 0) return kConfirmStop;
    if (strcmp(action, "reveal") == 0) return kReveal;
    if (strcmp(action, "review") == 0) return kReview;
    return 255;
}

bool hasAction(const BoardState &state, const char *action) {
    const uint8_t index = actionIndex(action);
    return index < 5 && state.actions[index];
}

ParseStateResult parseStateFrame(const uint8_t *data, size_t length, BoardState &state) {
    if (data == nullptr || length == 0 || length > kMaxFrameBytes) {
        return ParseStateResult::Invalid;
    }
    if (data[length - 1] == '\n') length -= 1;
    if (length == 0 || length > kMaxFrameBytes - 1) return ParseStateResult::Invalid;

    JsonDocument document;
    if (deserializeJson(document, data, length) != DeserializationError::Ok) {
        return ParseStateResult::Invalid;
    }
    JsonObjectConst object = document.as<JsonObjectConst>();
    if (object.isNull()) return ParseStateResult::Invalid;

    JsonVariantConst versionValue = object["v"];
    if (!versionValue.is<int>()) return ParseStateResult::Invalid;
    if (versionValue.as<int>() != kContractVersion) {
        return ParseStateResult::UnsupportedVersion;
    }
    if (!containsOnlyStateKeys(object)) return ParseStateResult::Invalid;
    if (!object["type"].is<const char *>() ||
        strcmp(object["type"].as<const char *>(), "state") != 0) {
        return ParseStateResult::Invalid;
    }

    JsonVariantConst sequenceValue = object["seq"];
    if (!sequenceValue.is<uint32_t>() || sequenceValue.as<uint32_t>() == 0) {
        return ParseStateResult::Invalid;
    }

    BoardState parsed;
    parsed.sequence = sequenceValue.as<uint32_t>();
    if (!copyText(object["phase"], parsed.phase) ||
        !copyText(object["c"], parsed.confidence)) {
        return ParseStateResult::Invalid;
    }

    if (hasKey(object, "d")) {
        JsonVariantConst distance = object["d"];
        if (!distance.is<float>() || !isfinite(distance.as<float>()) || distance.as<float>() < 0.0f) {
            return ParseStateResult::Invalid;
        }
        parsed.hasDistance = true;
        parsed.distanceM = distance.as<float>();
    }

    const bool hasTarget = hasKey(object, "tb");
    const bool hasDeclination = hasKey(object, "md");
    if (hasTarget != hasDeclination) return ParseStateResult::Invalid;
    if (hasTarget) {
        JsonVariantConst target = object["tb"];
        JsonVariantConst declination = object["md"];
        if (!validFiniteNumber(target, 0.0f, 360.0f, false) ||
            !validFiniteNumber(declination, -180.0f, 180.0f, true)) {
            return ParseStateResult::Invalid;
        }
        parsed.hasDirection = true;
        parsed.targetTrueBearingDegrees = target.as<float>();
        parsed.magneticDeclinationDegreesEast = declination.as<float>();
    }

    JsonArrayConst menus = object["m"].as<JsonArrayConst>();
    if (menus.isNull() || menus.size() > 2) return ParseStateResult::Invalid;
    for (JsonVariantConst menu : menus) {
        if (parsed.menuCount >= 2 ||
            !copyText(menu, parsed.menus[parsed.menuCount])) {
            return ParseStateResult::Invalid;
        }
        parsed.menuCount += 1;
    }
    if (hasKey(object, "p") &&
        !copyText(object["p"], parsed.priceBand)) {
        return ParseStateResult::Invalid;
    }

    JsonArrayConst actions = object["a"].as<JsonArrayConst>();
    if (actions.isNull() || actions.size() > 5) return ParseStateResult::Invalid;
    for (JsonVariantConst actionValue : actions) {
        if (!actionValue.is<const char *>()) return ParseStateResult::Invalid;
        const uint8_t index = actionIndex(actionValue.as<const char *>());
        if (index >= 5 || parsed.actions[index]) return ParseStateResult::Invalid;
        parsed.actions[index] = true;
    }

    if (!object["r"].is<bool>()) return ParseStateResult::Invalid;
    parsed.revealed = object["r"].as<bool>();
    if (!object["ts"].is<uint64_t>()) return ParseStateResult::Invalid;
    parsed.timestampMs = object["ts"].as<uint64_t>();
    state = parsed;
    return ParseStateResult::Accepted;
}

size_t encodeEvent(
    const char *action,
    uint32_t sequence,
    char *output,
    size_t outputCapacity
) {
    if (actionIndex(action) >= 5 || output == nullptr || outputCapacity == 0) return 0;
    JsonDocument document;
    document["v"] = kContractVersion;
    document["type"] = "event";
    document["action"] = action;
    document["seq"] = sequence;
    const size_t payloadLength = measureJson(document);
    if (payloadLength + 1 > kMaxFrameBytes || payloadLength + 2 > outputCapacity) return 0;
    if (serializeJson(document, output, outputCapacity) != payloadLength) return 0;
    output[payloadLength] = '\n';
    output[payloadLength + 1] = '\0';
    return payloadLength + 1;
}

}  // namespace physical_compass
