#pragma once

#include "compass_runtime.h"
#include <stdint.h>

using PhysicalCompassEventCallback = void (*)(const char *action, uint32_t sequence);

void displayUiBegin();
void displayUiSetModel(
    const roll_compass::CompassRenderModel &model,
    uint32_t sourceSequence,
    bool allowBleEvents
);
void displayUiTick(uint32_t nowMs);
void displayUiSetEventCallback(PhysicalCompassEventCallback callback);
