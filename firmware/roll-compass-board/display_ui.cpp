#include "display_ui.h"

#include <lvgl.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "compass_assets.h"
#include "display_copy.h"
#include "lvgl_v8_port.h"

namespace {

constexpr lv_coord_t kCompassSize = 520;
constexpr lv_coord_t kCompassX = -20;
constexpr lv_coord_t kCompassY = -20;
constexpr lv_coord_t kCompassBackdropSize = 520;
constexpr lv_coord_t kCompassBackdropX = -20;
constexpr lv_coord_t kCompassBackdropY = -20;
constexpr lv_coord_t kGlowSize = 500;
constexpr lv_coord_t kGlowX = -10;
constexpr lv_coord_t kGlowY = -10;
const lv_coord_t kSparkleX[] = {24, 448, 56, 424};
const lv_coord_t kSparkleY[] = {118, 92, 338, 314};

const lv_color_t kCanvas = lv_color_hex(0xF8F3E8);
const lv_color_t kPaper = lv_color_hex(0xF1E6CE);
const lv_color_t kPaperBright = lv_color_hex(0xFFF9ED);
const lv_color_t kInk = lv_color_hex(0x2A211A);
const lv_color_t kMutedInk = lv_color_hex(0x77685B);
const lv_color_t kBrass = lv_color_hex(0xB6863A);
const lv_color_t kBrassLight = lv_color_hex(0xD9BB78);
const lv_color_t kOxblood = lv_color_hex(0x8E1E22);
const lv_color_t kOxbloodSoft = lv_color_hex(0xEAD5C9);
const lv_color_t kSage = lv_color_hex(0x35685E);
const lv_color_t kSageSoft = lv_color_hex(0xDCE8DF);

lv_obj_t *brandLabel = nullptr;
lv_obj_t *connectionPill = nullptr;
lv_obj_t *connectionLabel = nullptr;
lv_obj_t *heroStatus = nullptr;
lv_obj_t *glowRing = nullptr;
lv_obj_t *compassShell = nullptr;
lv_obj_t *compassNeedle = nullptr;
lv_obj_t *sparkles[4] = {nullptr, nullptr, nullptr, nullptr};
lv_obj_t *distanceCaption = nullptr;
lv_obj_t *distanceValue = nullptr;
lv_obj_t *categoryValue = nullptr;
lv_obj_t *priceLabel = nullptr;
lv_obj_t *buttons[4] = {nullptr, nullptr, nullptr, nullptr};
lv_obj_t *buttonLabels[4] = {nullptr, nullptr, nullptr, nullptr};

physical_compass::BoardState currentState;
PhysicalCompassEventCallback eventCallback = nullptr;
bool connected = false;
bool hasState = false;
uint32_t lastStateMs = 0;
float currentNeedleAngle = 0.0f;
float targetNeedleAngle = 0.0f;

const char *const actionNames[] = {"stop", "continue", "confirm-stop", "reveal"};
const char *const actionLabels[] = {"정지", "계속", "정지 확인", "공개"};

lv_obj_t *makeCard(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t width, lv_coord_t height) {
    lv_obj_t *card = lv_obj_create(parent);
    lv_obj_remove_style_all(card);
    lv_obj_set_size(card, width, height);
    lv_obj_set_pos(card, x, y);
    lv_obj_set_style_bg_color(card, kPaper, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(card, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_radius(card, 26, LV_PART_MAIN);
    lv_obj_set_style_border_width(card, 1, LV_PART_MAIN);
    lv_obj_set_style_border_color(card, kBrassLight, LV_PART_MAIN);
    lv_obj_set_style_border_opa(card, LV_OPA_80, LV_PART_MAIN);
    lv_obj_set_style_shadow_width(card, 16, LV_PART_MAIN);
    lv_obj_set_style_shadow_color(card, lv_color_hex(0x6E4B2B), LV_PART_MAIN);
    lv_obj_set_style_shadow_opa(card, LV_OPA_20, LV_PART_MAIN);
    lv_obj_set_style_shadow_ofs_y(card, 5, LV_PART_MAIN);
    lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_clear_flag(card, LV_OBJ_FLAG_CLICKABLE);
    return card;
}

lv_obj_t *makeLabel(
    lv_obj_t *parent,
    lv_coord_t x,
    lv_coord_t y,
    lv_coord_t width,
    lv_coord_t height,
    const lv_font_t *font,
    lv_color_t color
) {
    lv_obj_t *label = lv_label_create(parent);
    lv_obj_set_size(label, width, height);
    lv_obj_set_pos(label, x, y);
    lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
    lv_obj_set_style_text_color(label, color, LV_PART_MAIN);
    lv_obj_set_style_text_opa(label, LV_OPA_COVER, LV_PART_MAIN);
    lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP);
    return label;
}

lv_obj_t *makePill(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t width, lv_coord_t height) {
    lv_obj_t *pill = lv_obj_create(parent);
    lv_obj_remove_style_all(pill);
    lv_obj_set_size(pill, width, height);
    lv_obj_set_pos(pill, x, y);
    lv_obj_set_style_radius(pill, height / 2, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(pill, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_clear_flag(pill, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_clear_flag(pill, LV_OBJ_FLAG_CLICKABLE);
    return pill;
}

float normalizeDegrees(float value) {
    while (value < 0.0f) value += 360.0f;
    while (value >= 360.0f) value -= 360.0f;
    return value;
}

float shortestDelta(float from, float to) {
    float delta = normalizeDegrees(to) - normalizeDegrees(from);
    if (delta > 180.0f) delta -= 360.0f;
    if (delta < -180.0f) delta += 360.0f;
    return delta;
}

bool stateFresh(uint32_t nowMs) {
    return connected && hasState && nowMs - lastStateMs < physical_compass::kStaleAfterMs;
}

void setButtonVisible(uint8_t index, bool visible) {
    if (buttons[index] == nullptr) return;
    if (visible) {
        lv_obj_clear_flag(buttons[index], LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(buttons[index], LV_OBJ_FLAG_HIDDEN);
    }
}

void styleButton(uint8_t index, bool visible) {
    if (buttons[index] == nullptr) return;
    const char *action = actionNames[index];
    const bool primary = strcmp(action, "stop") == 0 || strcmp(action, "confirm-stop") == 0;
    const bool reveal = strcmp(action, "reveal") == 0;
    const lv_color_t fill = primary ? kOxblood : reveal ? kBrass : kPaperBright;
    const lv_color_t text = primary || reveal ? kPaperBright : kOxblood;
    const lv_color_t border = primary ? kOxblood : reveal ? kBrass : kBrassLight;
    lv_obj_set_style_bg_color(buttons[index], fill, LV_PART_MAIN);
    lv_obj_set_style_text_color(buttonLabels[index], text, LV_PART_MAIN);
    lv_obj_set_style_border_color(buttons[index], border, LV_PART_MAIN);
    lv_obj_set_style_border_width(buttons[index], primary || reveal ? 0 : 1, LV_PART_MAIN);
    lv_obj_set_style_shadow_width(buttons[index], visible ? 8 : 0, LV_PART_MAIN);
    lv_obj_set_style_shadow_color(buttons[index], primary ? kOxblood : kBrass, LV_PART_MAIN);
    lv_obj_set_style_shadow_opa(buttons[index], visible ? LV_OPA_30 : LV_OPA_TRANSP, LV_PART_MAIN);
}

void updateConnectionPill() {
    if (connectionPill == nullptr || connectionLabel == nullptr) return;
    const std::string text = physical_compass::display::connectionText(connected);
    lv_label_set_text(connectionLabel, text.c_str());
    lv_obj_set_style_bg_color(connectionPill, connected ? kSageSoft : kOxbloodSoft, LV_PART_MAIN);
    lv_obj_set_style_border_width(connectionPill, 1, LV_PART_MAIN);
    lv_obj_set_style_border_color(connectionPill, connected ? kSage : kOxblood, LV_PART_MAIN);
    lv_obj_set_style_text_color(connectionLabel, connected ? kSage : kOxblood, LV_PART_MAIN);
}

void renderState() {
    if (heroStatus == nullptr) return;
    const uint32_t nowMs = millis();
    const bool fresh = stateFresh(nowMs);
    const bool credible = fresh && currentState.confidence == "credible" && currentState.hasBearing;

    updateConnectionPill();
    const std::string status = physical_compass::display::phaseStatus(
        fresh,
        credible,
        currentState.revealed,
        currentState.phase == "near",
        connected
    );
    lv_label_set_text(heroStatus, status.c_str());
    lv_obj_set_style_text_color(heroStatus, currentState.revealed ? kSage : credible ? kOxblood : kMutedInk, LV_PART_MAIN);

    if (fresh && currentState.hasBearing) {
        targetNeedleAngle = normalizeDegrees(currentState.bearingDegrees);
    }
    if (compassNeedle != nullptr) {
        if (credible) {
            lv_obj_clear_flag(compassNeedle, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(compassNeedle, LV_OBJ_FLAG_HIDDEN);
        }
    }

    if (!fresh) {
        lv_label_set_text(distanceValue, "-- m");
        lv_label_set_text(distanceCaption, "남은 거리");
    } else if (currentState.revealed && !currentState.hasDistance) {
        lv_label_set_text(distanceValue, "도착");
        lv_label_set_text(distanceCaption, "여정 완료");
    } else if (currentState.hasDistance) {
        char distance[32];
        if (currentState.distanceM >= 1000.0f) {
            snprintf(distance, sizeof(distance), "%.1f km", currentState.distanceM / 1000.0f);
        } else {
            snprintf(distance, sizeof(distance), "%.0f m", currentState.distanceM);
        }
        lv_label_set_text(distanceValue, distance);
        lv_label_set_text(distanceCaption, "남은 거리");
    } else {
        lv_label_set_text(distanceValue, "-- m");
        lv_label_set_text(distanceCaption, "남은 거리");
    }

    if (fresh && currentState.menuCount > 0) {
        const std::string menu = physical_compass::display::menuText(currentState);
        lv_label_set_text(categoryValue, menu.c_str());
        const std::string price = physical_compass::display::priceText(currentState.priceBand);
        lv_label_set_text(priceLabel, price.c_str());
    } else {
        lv_label_set_text(categoryValue, "분류 대기");
        lv_label_set_text(priceLabel, "가격 미정");
    }

    for (uint8_t index = 0; index < 4; ++index) {
        const bool visible = fresh && physical_compass::hasAction(currentState, actionNames[index]);
        setButtonVisible(index, visible);
        styleButton(index, visible);
    }
}

void buttonClicked(lv_event_t *event) {
    if (eventCallback == nullptr) return;
    const char *action = static_cast<const char *>(lv_event_get_user_data(event));
    if (action != nullptr && physical_compass::hasAction(currentState, action)) {
        eventCallback(action, currentState.sequence);
    }
}

void animateCompass(uint32_t nowMs) {
    if (compassNeedle != nullptr && !lv_obj_has_flag(compassNeedle, LV_OBJ_FLAG_HIDDEN)) {
        const float delta = shortestDelta(currentNeedleAngle, targetNeedleAngle);
        currentNeedleAngle = normalizeDegrees(currentNeedleAngle + delta * 0.18f);
        if (fabsf(delta) < 0.08f) currentNeedleAngle = targetNeedleAngle;
        lv_img_set_angle(compassNeedle, static_cast<int16_t>(lroundf(currentNeedleAngle * 10.0f)));
    }

    const bool fresh = stateFresh(nowMs);
    const bool hunting = connected && !fresh;
    const bool active = fresh && currentState.hasBearing && currentState.confidence == "credible";
    const float wave = (sinf(static_cast<float>(nowMs) / (active ? 430.0f : 620.0f)) + 1.0f) * 0.5f;
    if (glowRing != nullptr) {
        const uint8_t opacity = active ? static_cast<uint8_t>(80 + wave * 90) : hunting ? static_cast<uint8_t>(35 + wave * 55) : 18;
        lv_obj_set_style_opa(glowRing, opacity, LV_PART_MAIN);
        lv_obj_set_style_arc_width(glowRing, active ? static_cast<uint8_t>(3 + wave * 3) : 2, LV_PART_MAIN);
    }

    for (uint8_t index = 0; index < 4; ++index) {
        if (sparkles[index] == nullptr) continue;
        const float sparkleWave = (sinf(static_cast<float>(nowMs) / 260.0f + index * 1.45f) + 1.0f) * 0.5f;
        const uint8_t opacity = active || hunting
            ? static_cast<uint8_t>(55 + sparkleWave * 190)
            : static_cast<uint8_t>(18 + sparkleWave * 38);
        lv_obj_set_style_opa(sparkles[index], opacity, LV_PART_MAIN);
        lv_obj_set_y(sparkles[index], kSparkleY[index] + static_cast<lv_coord_t>(sparkleWave * 5.0f));
    }
}

}  // namespace

void displayUiBegin() {
    lv_obj_t *screen = lv_scr_act();
    lv_obj_set_style_bg_color(screen, kCanvas, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);

    // The board is a circular instrument first. Everything else is layered on
    // top of this face so the screen never reads as a dashboard of cards.
    lv_obj_t *compassBackdrop = makeCard(
        screen,
        kCompassBackdropX,
        kCompassBackdropY,
        kCompassBackdropSize,
        kCompassBackdropSize
    );
    lv_obj_set_style_radius(compassBackdrop, LV_RADIUS_CIRCLE, LV_PART_MAIN);
    lv_obj_set_style_bg_color(compassBackdrop, lv_color_hex(0xF2E8D5), LV_PART_MAIN);
    lv_obj_set_style_border_width(compassBackdrop, 2, LV_PART_MAIN);
    lv_obj_set_style_shadow_width(compassBackdrop, 24, LV_PART_MAIN);
    lv_obj_set_style_shadow_opa(compassBackdrop, LV_OPA_30, LV_PART_MAIN);

    glowRing = lv_arc_create(screen);
    lv_obj_remove_style_all(glowRing);
    lv_obj_set_size(glowRing, kGlowSize, kGlowSize);
    lv_obj_set_pos(glowRing, kGlowX, kGlowY);
    lv_arc_set_bg_angles(glowRing, 0, 359);
    lv_arc_set_angles(glowRing, 0, 359);
    lv_obj_set_style_arc_color(glowRing, kBrassLight, LV_PART_MAIN);
    lv_obj_set_style_arc_opa(glowRing, LV_OPA_30, LV_PART_MAIN);
    lv_obj_set_style_arc_width(glowRing, 3, LV_PART_MAIN);
    lv_obj_set_style_arc_rounded(glowRing, true, LV_PART_MAIN);
    lv_obj_set_style_opa(glowRing, LV_OPA_30, LV_PART_MAIN);
    lv_obj_clear_flag(glowRing, LV_OBJ_FLAG_CLICKABLE);

    compassShell = lv_img_create(screen);
    lv_img_set_src(compassShell, &rollCompassShellImage);
    lv_obj_set_pos(compassShell, kCompassX, kCompassY);
    lv_obj_clear_flag(compassShell, LV_OBJ_FLAG_CLICKABLE);

    compassNeedle = lv_img_create(screen);
    lv_img_set_src(compassNeedle, &rollCompassNeedleImage);
    lv_img_set_pivot(compassNeedle, kCompassSize / 2, kCompassSize / 2);
    lv_img_set_angle(compassNeedle, 0);
    lv_obj_set_pos(compassNeedle, kCompassX, kCompassY);
    lv_obj_clear_flag(compassNeedle, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(compassNeedle, LV_OBJ_FLAG_HIDDEN);

    for (uint8_t index = 0; index < 4; ++index) {
        sparkles[index] = lv_obj_create(screen);
        lv_obj_remove_style_all(sparkles[index]);
        lv_obj_set_size(sparkles[index], index % 2 == 0 ? 8 : 5, index % 2 == 0 ? 8 : 5);
        lv_obj_set_pos(sparkles[index], kSparkleX[index], kSparkleY[index]);
        lv_obj_set_style_radius(sparkles[index], LV_RADIUS_CIRCLE, LV_PART_MAIN);
        lv_obj_set_style_bg_color(sparkles[index], index % 2 == 0 ? kBrass : kOxblood, LV_PART_MAIN);
        lv_obj_set_style_bg_opa(sparkles[index], LV_OPA_70, LV_PART_MAIN);
        lv_obj_clear_flag(sparkles[index], LV_OBJ_FLAG_CLICKABLE);
    }

    // Status is a translucent capsule on the dial, not a separate panel.
    lv_obj_t *statusPill = makePill(screen, 94, 338, 292, 30);
    lv_obj_set_style_bg_color(statusPill, kPaperBright, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(statusPill, LV_OPA_90, LV_PART_MAIN);
    lv_obj_set_style_border_width(statusPill, 1, LV_PART_MAIN);
    lv_obj_set_style_border_color(statusPill, kBrassLight, LV_PART_MAIN);
    lv_obj_set_style_shadow_width(statusPill, 8, LV_PART_MAIN);
    lv_obj_set_style_shadow_color(statusPill, kBrass, LV_PART_MAIN);
    lv_obj_set_style_shadow_opa(statusPill, LV_OPA_20, LV_PART_MAIN);
    heroStatus = makeLabel(statusPill, 8, 5, 276, 20, &lv_font_montserrat_12, kMutedInk);
    lv_obj_set_style_text_align(heroStatus, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    lv_obj_set_style_text_letter_space(heroStatus, 1, LV_PART_MAIN);

    // One compact information capsule replaces the former rectangular rows.
    lv_obj_t *infoPill = makePill(screen, 58, 372, 364, 52);
    lv_obj_set_style_bg_color(infoPill, kCanvas, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(infoPill, LV_OPA_90, LV_PART_MAIN);
    lv_obj_set_style_border_width(infoPill, 1, LV_PART_MAIN);
    lv_obj_set_style_border_color(infoPill, kBrassLight, LV_PART_MAIN);
    lv_obj_set_style_shadow_width(infoPill, 8, LV_PART_MAIN);
    lv_obj_set_style_shadow_color(infoPill, kBrass, LV_PART_MAIN);
    lv_obj_set_style_shadow_opa(infoPill, LV_OPA_20, LV_PART_MAIN);

    distanceCaption = makeLabel(infoPill, 14, 5, 136, 14, &lv_font_montserrat_10, kMutedInk);
    lv_label_set_text(distanceCaption, "남은 거리");
    distanceValue = makeLabel(infoPill, 14, 18, 136, 30, &lv_font_montserrat_22, kInk);
    lv_label_set_text(distanceValue, "-- m");
    categoryValue = makeLabel(infoPill, 154, 8, 196, 18, &lv_font_montserrat_12, kInk);
    lv_label_set_text(categoryValue, "분류 대기");
    priceLabel = makeLabel(infoPill, 154, 28, 196, 14, &lv_font_montserrat_10, kBrass);
    lv_label_set_text(priceLabel, "가격 미정");

    for (uint8_t index = 0; index < 4; ++index) {
        buttons[index] = lv_btn_create(screen);
        lv_obj_set_size(buttons[index], 96, 38);
        lv_obj_set_pos(buttons[index], 38 + static_cast<lv_coord_t>(index) * 102, 433);
        lv_obj_set_style_radius(buttons[index], 19, LV_PART_MAIN);
        lv_obj_set_style_bg_opa(buttons[index], LV_OPA_COVER, LV_PART_MAIN);
        lv_obj_set_style_pad_all(buttons[index], 0, LV_PART_MAIN);
        lv_obj_add_event_cb(buttons[index], buttonClicked, LV_EVENT_CLICKED, (void *)actionNames[index]);
        buttonLabels[index] = lv_label_create(buttons[index]);
        lv_label_set_text(buttonLabels[index], actionLabels[index]);
        lv_obj_set_style_text_font(buttonLabels[index], &lv_font_montserrat_10, LV_PART_MAIN);
        lv_obj_set_style_text_letter_space(buttonLabels[index], 1, LV_PART_MAIN);
        lv_obj_center(buttonLabels[index]);
        setButtonVisible(index, false);
        styleButton(index, false);
    }

    // Keep the tiny chrome in the foreground while the compass remains the
    // visual subject underneath it.
    brandLabel = makeLabel(screen, 24, 15, 250, 20, &lv_font_montserrat_12, kInk);
    lv_label_set_text(brandLabel, "ROLL THE COMPASS");
    lv_obj_set_style_text_letter_space(brandLabel, 2, LV_PART_MAIN);

    connectionPill = makePill(screen, 332, 13, 128, 24);
    connectionLabel = makeLabel(connectionPill, 4, 3, 120, 18, &lv_font_montserrat_10, kOxblood);
    lv_obj_set_style_text_align(connectionLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);

    renderState();
}

void displayUiSetState(const physical_compass::BoardState &state) {
    currentState = state;
    hasState = true;
    lastStateMs = millis();
    if (currentState.hasBearing) targetNeedleAngle = normalizeDegrees(currentState.bearingDegrees);
    if (lvgl_port_lock(-1)) {
        renderState();
        lvgl_port_unlock();
    }
}

void displayUiSetConnection(bool value) {
    if (connected == value) return;
    connected = value;
    if (!connected) {
        currentState = physical_compass::BoardState();
        hasState = false;
        lastStateMs = 0;
        currentNeedleAngle = 0.0f;
        targetNeedleAngle = 0.0f;
    }
    if (lvgl_port_lock(-1)) {
        renderState();
        lvgl_port_unlock();
    }
}

void displayUiTick(uint32_t nowMs) {
    if (lvgl_port_lock(-1)) {
        if (hasState && nowMs - lastStateMs >= physical_compass::kStaleAfterMs && compassNeedle != nullptr &&
            !lv_obj_has_flag(compassNeedle, LV_OBJ_FLAG_HIDDEN)) {
            renderState();
        }
        animateCompass(nowMs);
        lvgl_port_unlock();
    }
}

void displayUiSetEventCallback(PhysicalCompassEventCallback callback) {
    eventCallback = callback;
}
