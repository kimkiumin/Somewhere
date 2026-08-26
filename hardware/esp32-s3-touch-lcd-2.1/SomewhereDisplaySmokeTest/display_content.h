#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

static constexpr size_t SOMEWHERE_DISPLAY_TEXT_LIMIT = 16;
static constexpr size_t SOMEWHERE_PRICE_TEXT_LIMIT = 12;

inline void formatDistanceMeters(int32_t meters, char *out, size_t capacity) {
  if (capacity == 0) {
    return;
  }

  if (meters < 0) {
    snprintf(out, capacity, "--");
    return;
  }

  if (meters >= 1000) {
    const double kilometers = static_cast<double>(meters) / 1000.0;
    snprintf(out, capacity, kilometers >= 10.0 ? "%.0f km" : "%.1f km", kilometers);
    return;
  }

  snprintf(out, capacity, "%ld m", static_cast<long>(meters));
}

inline void copyDisplayText(char *out, size_t capacity, const char *value,
                            size_t maxChars = SOMEWHERE_DISPLAY_TEXT_LIMIT) {
  if (capacity == 0) {
    return;
  }

  const char *source = value == nullptr ? "" : value;
  size_t index = 0;
  while (source[index] != '\0' && index < maxChars && index + 1 < capacity) {
    out[index] = source[index];
    ++index;
  }
  out[index] = '\0';
}

inline void formatPriceBand(const char *value, char *out, size_t capacity) {
  if (capacity == 0) {
    return;
  }

  const char *source = value == nullptr ? "" : value;
  size_t output_index = 0;
  bool has_digit = false;
  bool has_decimal = false;

  for (size_t index = 0; source[index] != '\0'; ++index) {
    const char character = source[index];
    if (character == '.' && !has_decimal && output_index + 1 < capacity && output_index + 1 < SOMEWHERE_PRICE_TEXT_LIMIT) {
      out[output_index++] = character;
      has_decimal = true;
      continue;
    }
    if (character < '0' || character > '9') {
      continue;
    }

    has_digit = true;
    if (output_index + 1 < capacity && output_index + 1 < SOMEWHERE_PRICE_TEXT_LIMIT) {
      out[output_index++] = character;
    }
  }

  if (!has_digit || output_index == 0) {
    snprintf(out, capacity, "-");
    return;
  }

  out[output_index] = '\0';
}
