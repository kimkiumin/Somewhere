#include "display_copy.h"

namespace physical_compass::display {

std::string menuText(const BoardState &state) {
    std::string result;
    for (uint8_t index = 0; index < state.menuCount && index < 2; ++index) {
        if (index != 0) result += " / ";
        result += state.menus[index];
    }
    return result.empty() ? "분류 미정" : result;
}

std::string priceText(const std::string &value) {
    if (value == "low") return "가벼운 가격대";
    if (value == "medium") return "보통 가격대";
    if (value == "high") return "높은 가격대";
    return value.empty() ? "가격 미정" : value;
}

std::string phaseStatus(bool fresh, bool credible, bool revealed, bool near, bool connected) {
    if (!connected) return "보드 연결 대기";
    if (!fresh) return "새 안내 대기";
    if (revealed) return "도착 공개";
    if (near) return "목적지 가까움";
    if (credible) return "빨간 바늘을 따라가세요";
    return "방향 확인 중";
}

std::string connectionText(bool connected) {
    return connected ? "BLE 연결됨" : "BLE 대기";
}

}  // namespace physical_compass::display
