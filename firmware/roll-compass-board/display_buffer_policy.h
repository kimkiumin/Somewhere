#pragma once

#include <stdint.h>

namespace roll_compass {

enum class DisplayBufferPreference : uint8_t {
    DirectDouble,
    Partial,
};

constexpr DisplayBufferPreference displayBufferPreference(
    uint32_t freePsramBytes,
    uint32_t directModeMinimumBytes
) {
    return freePsramBytes >= directModeMinimumBytes
        ? DisplayBufferPreference::DirectDouble
        : DisplayBufferPreference::Partial;
}

}  // namespace roll_compass
