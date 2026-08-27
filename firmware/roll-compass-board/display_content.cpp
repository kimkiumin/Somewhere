#include "display_content.h"

#include <ctype.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

namespace roll_compass {

namespace {

bool isAsciiSpace(char value) {
    return value == ' ' || value == '\t' || value == '\n' || value == '\r';
}

bool isContinuationByte(unsigned char value) {
    return (value & 0xC0U) == 0x80U;
}

size_t utf8SequenceLength(const char *value, size_t remaining) {
    const unsigned char first = static_cast<unsigned char>(value[0]);
    if (first < 0x80U) return 1;
    if (first >= 0xC2U && first <= 0xDFU && remaining >= 2 &&
        isContinuationByte(static_cast<unsigned char>(value[1]))) return 2;
    if (first >= 0xE0U && first <= 0xEFU && remaining >= 3 &&
        isContinuationByte(static_cast<unsigned char>(value[1])) &&
        isContinuationByte(value[2])) {
        return 3;
    }
    if (first >= 0xF0U && first <= 0xF4U && remaining >= 4 &&
        isContinuationByte(static_cast<unsigned char>(value[1])) &&
        isContinuationByte(static_cast<unsigned char>(value[2])) &&
        isContinuationByte(static_cast<unsigned char>(value[3]))) {
        return 4;
    }
    return 1;
}

bool startsWithMarker(const char *value, size_t remaining, const char *marker) {
    constexpr size_t kWonMarkerBytes = 3;
    return remaining >= kWonMarkerBytes &&
        memcmp(value, marker, kWonMarkerBytes) == 0;
}

const char *trimmedStart(const char *value, size_t &length) {
    if (value == nullptr) {
        length = 0;
        return "";
    }

    const size_t valueLength = strlen(value);
    size_t start = 0;
    while (start < valueLength && isAsciiSpace(value[start])) ++start;
    size_t end = valueLength;
    while (end > start && isAsciiSpace(value[end - 1])) --end;
    length = end - start;
    return value + start;
}

bool equalsAsciiIgnoreCase(const char *value, size_t length, const char *expected) {
    const size_t expectedLength = strlen(expected);
    if (length != expectedLength) return false;
    for (size_t index = 0; index < length; ++index) {
        const unsigned char left = static_cast<unsigned char>(value[index]);
        const unsigned char right = static_cast<unsigned char>(expected[index]);
        if (tolower(left) != tolower(right)) return false;
    }
    return true;
}

bool equalsKoreanNoPreference(const char *value, size_t length) {
    constexpr char expected[] = "상관없음";
    size_t expectedIndex = 0;
    for (size_t valueIndex = 0; valueIndex < length; ++valueIndex) {
        if (isAsciiSpace(value[valueIndex])) continue;
        if (expected[expectedIndex] == '\0' || value[valueIndex] != expected[expectedIndex]) {
            return false;
        }
        expectedIndex += 1;
    }
    return expected[expectedIndex] == '\0';
}

bool isNoPreference(const char *value, size_t length) {
    return equalsKoreanNoPreference(value, length) ||
        (length == strlen("무관") && memcmp(value, "무관", length) == 0) ||
        equalsAsciiIgnoreCase(value, length, "any") ||
        equalsAsciiIgnoreCase(value, length, "no preference");
}

size_t copyWithoutWonMarkers(
    const char *value,
    size_t length,
    char *out,
    size_t capacity
) {
    if (capacity == 0) return 0;

    size_t outputIndex = 0;
    for (size_t index = 0; index < length && outputIndex + 1 < capacity;) {
        const size_t remaining = length - index;
        if (startsWithMarker(value + index, remaining, "₩") ||
            startsWithMarker(value + index, remaining, "원")) {
            index += 3;
            continue;
        }
        const size_t sequenceLength = utf8SequenceLength(value + index, remaining);
        if (outputIndex + sequenceLength >= capacity) break;
        for (size_t offset = 0; offset < sequenceLength; ++offset) {
            out[outputIndex++] = value[index + offset];
        }
        index += sequenceLength;
    }
    out[outputIndex] = '\0';
    return outputIndex;
}

bool isNumericPrice(const char *value) {
    if (value == nullptr || value[0] == '\0') return false;

    bool hasDigit = false;
    bool hasDecimal = false;
    size_t length = strlen(value);
    if (value[0] == '.' || value[length - 1] == '.') return false;
    for (size_t index = 0; index < length; ++index) {
        if (value[index] >= '0' && value[index] <= '9') {
            hasDigit = true;
        } else if (value[index] == '.' && !hasDecimal) {
            hasDecimal = true;
        } else {
            return false;
        }
    }
    return hasDigit;
}

}  // namespace

void formatDistanceMeters(float meters, char *out, size_t capacity) {
    if (out == nullptr || capacity == 0) return;
    if (!isfinite(meters) || meters < 0.0f) {
        snprintf(out, capacity, "--");
    } else if (meters >= 1000.0f) {
        const float kilometers = meters / 1000.0f;
        snprintf(
            out,
            capacity,
            kilometers >= 10.0f ? "%.0f km" : "%.1f km",
            kilometers
        );
    } else {
        snprintf(out, capacity, "%.0f m", meters);
    }
}

void copyDisplayText(char *out, size_t capacity, const char *value, size_t maxCharacters) {
    if (out == nullptr || capacity == 0) return;
    const char *source = value == nullptr ? "" : value;
    size_t sourceIndex = 0;
    size_t outputIndex = 0;
    size_t characterCount = 0;
    while (source[sourceIndex] != '\0' && characterCount < maxCharacters) {
        const size_t sequenceLength = utf8SequenceLength(
            source + sourceIndex,
            strlen(source) - sourceIndex
        );
        if (outputIndex + sequenceLength >= capacity) break;
        for (size_t offset = 0; offset < sequenceLength; ++offset) {
            out[outputIndex++] = source[sourceIndex + offset];
        }
        sourceIndex += sequenceLength;
        ++characterCount;
    }
    out[outputIndex] = '\0';
}

void formatPriceBand(const char *value, char *out, size_t capacity) {
    if (out == nullptr || capacity == 0) return;

    size_t trimmedLength = 0;
    const char *trimmed = trimmedStart(value, trimmedLength);
    if (trimmedLength == 0 || isNoPreference(trimmed, trimmedLength)) {
        snprintf(out, capacity, "-");
        return;
    }

    char normalized[64] = {};
    copyWithoutWonMarkers(trimmed, trimmedLength, normalized, sizeof(normalized));

    char numericCandidate[64] = {};
    size_t candidateIndex = 0;
    for (size_t index = 0; index < strlen(normalized) && candidateIndex + 1 < sizeof(numericCandidate); ++index) {
        if (normalized[index] == ',' || isAsciiSpace(normalized[index])) continue;
        numericCandidate[candidateIndex++] = normalized[index];
    }
    numericCandidate[candidateIndex] = '\0';

    if (isNumericPrice(numericCandidate)) {
        copyDisplayText(out, capacity, numericCandidate, kPriceTextLimit);
        return;
    }

    copyDisplayText(out, capacity, normalized, kPriceTextLimit);
    if (out[0] == '\0') snprintf(out, capacity, "-");
}

bool isAsciiDisplayText(const char *value) {
    if (value == nullptr) return true;
    for (size_t index = 0; value[index] != '\0'; ++index) {
        if (static_cast<unsigned char>(value[index]) > 0x7FU) return false;
    }
    return true;
}

}  // namespace roll_compass
