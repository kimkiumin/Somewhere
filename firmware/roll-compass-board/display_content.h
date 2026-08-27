#pragma once

#include <stddef.h>

namespace roll_compass {

constexpr size_t kDisplayTextLimit = 16;
constexpr size_t kPriceTextLimit = 12;

void formatDistanceMeters(float meters, char *out, size_t capacity);
void copyDisplayText(
    char *out,
    size_t capacity,
    const char *value,
    size_t maxCharacters = kDisplayTextLimit
);
void formatPriceBand(const char *value, char *out, size_t capacity);
bool isAsciiDisplayText(const char *value);

}  // namespace roll_compass
