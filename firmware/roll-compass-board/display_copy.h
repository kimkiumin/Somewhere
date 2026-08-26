#pragma once

#include <string>

#include "physical_compass_protocol.h"

namespace physical_compass::display {

std::string menuText(const BoardState &state);
std::string priceText(const std::string &value);
std::string phaseStatus(bool fresh, bool credible, bool revealed, bool near, bool connected);
std::string connectionText(bool connected);

}  // namespace physical_compass::display
