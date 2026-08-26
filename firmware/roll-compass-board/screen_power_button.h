#pragma once

#include <stdint.h>

namespace roll_compass {

enum class ScreenPowerButtonEvent : uint8_t {
    None,
    Pressed,
};

class ScreenPowerButton {
public:
    explicit ScreenPowerButton(uint32_t releaseDebounceMs = 20U);

    void reset(bool pressed, uint32_t nowMs);
    ScreenPowerButtonEvent update(bool pressed, uint32_t nowMs);

private:
    uint32_t releaseDebounceMs_;
    uint32_t rawChangedAtMs_ = 0;
    bool rawPressed_ = false;
    bool armed_ = true;
};

}  // namespace roll_compass
