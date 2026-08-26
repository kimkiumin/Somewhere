#pragma once

#include "compass_runtime.h"
#include "physical_compass_wire.h"

using PhysicalCompassEventCallback = void (*)(const char *action, uint32_t sequence);

void displayUiBegin();
void displayUiSetRuntime(
    const physical_compass::BoardState &state,
    const roll_compass::CompassRenderModel &model
);
void displayUiTick(uint32_t nowMs);
void displayUiSetEventCallback(PhysicalCompassEventCallback callback);
