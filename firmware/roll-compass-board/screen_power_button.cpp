#include "screen_power_button.h"

namespace roll_compass {

ScreenPowerButton::ScreenPowerButton(uint32_t releaseDebounceMs):
    releaseDebounceMs_(releaseDebounceMs) {}

void ScreenPowerButton::reset(bool pressed, uint32_t nowMs) {
    rawPressed_ = pressed;
    armed_ = !pressed;
    rawChangedAtMs_ = nowMs;
}

ScreenPowerButtonEvent ScreenPowerButton::update(bool pressed, uint32_t nowMs) {
    if (pressed) {
        rawPressed_ = true;
        if (!armed_) return ScreenPowerButtonEvent::None;
        armed_ = false;
        return ScreenPowerButtonEvent::Pressed;
    }

    if (rawPressed_) {
        rawPressed_ = false;
        rawChangedAtMs_ = nowMs;
        return ScreenPowerButtonEvent::None;
    }
    if (!armed_ && nowMs - rawChangedAtMs_ >= releaseDebounceMs_) {
        armed_ = true;
    }
    return ScreenPowerButtonEvent::None;
}

}  // namespace roll_compass
