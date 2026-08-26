#include "physical_compass_wire.h"

#include <ArduinoJson.h>
#include <math.h>

namespace physical_compass {

namespace {

bool validText(const char *value, size_t maxLength) {
    return value != nullptr && value[0] != '\0' && strnlen(value, maxLength + 1) <= maxLength;
}

bool copyText(JsonVariantConst value, String &destination, size_t maxLength, bool required) {
    if (!value.is<const char *>()) {
        return !required;
    }
    const char *raw = value.as<const char *>();
    if (required && !validText(raw, maxLength)) {
        return false;
    }
    if (raw != nullptr && strnlen(raw, maxLength + 1) > maxLength) {
        return false;
    }
    destination = raw == nullptr ? "" : raw;
    return true;
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

bool parseStateFrame(const uint8_t *data, size_t length, BoardState &state) {
    if (data == nullptr || length == 0 || length > kMaxFrameBytes) return false;
    if (data[length - 1] == '\n') length -= 1;
    if (length == 0 || length > kMaxFrameBytes - 1) return false;

    JsonDocument document;
    if (deserializeJson(document, data, length) != DeserializationError::Ok) return false;
    if (document["v"] != kContractVersion || document["type"] != "state") return false;

    JsonVariantConst sequenceValue = document["seq"];
    if (!sequenceValue.is<uint32_t>() || sequenceValue.as<uint32_t>() == 0) return false;

    BoardState parsed;
    parsed.sequence = sequenceValue.as<uint32_t>();
    if (!copyText(document["phase"], parsed.phase, 40, true)) return false;
    if (!copyText(document["c"], parsed.confidence, 40, true)) return false;

    JsonVariantConst distance = document["d"];
    if (!distance.isNull()) {
        if (!distance.is<float>() || !isfinite(distance.as<float>()) || distance.as<float>() < 0) return false;
        parsed.hasDistance = true;
        parsed.distanceM = distance.as<float>();
    }

    JsonVariantConst bearing = document["b"];
    if (!bearing.isNull()) {
        if (!bearing.is<float>() || !isfinite(bearing.as<float>()) || bearing.as<float>() < 0 || bearing.as<float>() >= 360) {
            return false;
        }
        parsed.hasBearing = true;
        parsed.bearingDegrees = bearing.as<float>();
    }

    JsonArrayConst menus = document["m"].as<JsonArrayConst>();
    if (menus.isNull() || menus.size() > 2) return false;
    for (JsonVariantConst menu : menus) {
        if (parsed.menuCount >= 2 || !copyText(menu, parsed.menus[parsed.menuCount], 40, true)) return false;
        parsed.menuCount += 1;
    }
    if (!copyText(document["p"], parsed.priceBand, 40, false)) return false;

    JsonArrayConst actions = document["a"].as<JsonArrayConst>();
    if (actions.isNull()) return false;
    for (JsonVariantConst actionValue : actions) {
        if (!actionValue.is<const char *>()) return false;
        const uint8_t index = actionIndex(actionValue.as<const char *>());
        if (index >= 5 || parsed.actions[index]) return false;
        parsed.actions[index] = true;
    }

    if (!document["r"].is<bool>()) return false;
    parsed.revealed = document["r"].as<bool>();
    if (!document["ts"].is<uint64_t>()) return false;
    parsed.timestampMs = document["ts"].as<uint64_t>();
    state = parsed;
    return true;
}

String encodeEvent(const char *action, uint32_t sequence) {
    if (actionIndex(action) >= 5) return String();
    JsonDocument document;
    document["v"] = kContractVersion;
    document["type"] = "event";
    document["action"] = action;
    document["seq"] = sequence;
    String output;
    serializeJson(document, output);
    output += '\n';
    if (output.length() > kMaxFrameBytes) return String();
    return output;
}

}  // namespace physical_compass
