#pragma once

#include "physical_compass_wire.h"

using PhysicalCompassEventCallback = void (*)(const char *action, uint32_t sequence);

void displayUiBegin();
void displayUiSetState(const physical_compass::BoardState &state);
void displayUiSetConnection(bool connected);
void displayUiTick(uint32_t nowMs);
void displayUiSetEventCallback(PhysicalCompassEventCallback callback);

