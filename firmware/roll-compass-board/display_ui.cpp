#include "display_ui.h"

#include <lvgl.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "compass_artwork.h"
#include "compass_layout.h"
#include "compass_math.h"
#include "display_content.h"
#include "lvgl_v8_port.h"
#include "needle_spring.h"
#include "needle_styles.h"
#include "univers_font_adapter.h"

LV_FONT_DECLARE(roll_compass_korean_16)
LV_FONT_DECLARE(roll_compass_korean_20)

namespace {

constexpr int16_t kScreenSize = somewhere_artwork::SCREEN_SIZE;
constexpr uint32_t kNeedleStepMs = 25;
constexpr uint8_t kMaximumCatchUpSteps = 4;
constexpr uint8_t kStopAction = 1U << 0;
constexpr uint8_t kContinueAction = 1U << 1;
constexpr uint8_t kConfirmStopAction = 1U << 2;
constexpr uint8_t kRevealAction = 1U << 3;
// Match the collaborator smoke test's muted-label/full-value hierarchy.
constexpr lv_opa_t kReadoutLabelOpacity = 168;
constexpr lv_opa_t kReadoutValueOpacity = LV_OPA_COVER;

// These values are the collaborator's source SVG palette, expressed at the
// RGB565 display boundary. The geometry is kept in compass_artwork.h.
const lv_color_t kBackground = lv_color_hex(0x050706);
const lv_color_t kOffWhite = lv_color_hex(0xE4ECE8);
const lv_color_t kCardinalWhite = lv_color_hex(0xE8ECE8);
const lv_color_t kGreen = lv_color_hex(0x4DFF76);
const lv_color_t kPink = lv_color_hex(0xFF3850);

lv_obj_t *faceBackground = nullptr;
lv_obj_t *tickObjects[somewhere_artwork::TICK_COUNT] = {};
lv_point_t tickPoints[somewhere_artwork::TICK_COUNT][2] = {};
lv_obj_t *needleStrokeObjects[roll_compass::kNeedleMaximumStrokes] = {};
lv_point_t needleStrokePoints[roll_compass::kNeedleMaximumStrokes]
    [roll_compass::kNeedleMaximumPoints] = {};
lv_obj_t *needleDiscObjects[roll_compass::kNeedleMaximumDiscs] = {};
lv_obj_t *northLabel = nullptr;
lv_obj_t *southLabel = nullptr;
lv_obj_t *westLabel = nullptr;
lv_obj_t *eastLabel = nullptr;
lv_obj_t *remainingLabel = nullptr;
lv_obj_t *distanceValue = nullptr;
lv_obj_t *priceLabel = nullptr;
lv_obj_t *priceValue = nullptr;
lv_obj_t *menuLabel = nullptr;
lv_obj_t *menuValue = nullptr;
lv_obj_t *statusLabel = nullptr;
lv_obj_t *primaryButton = nullptr;
lv_obj_t *primaryButtonLabel = nullptr;
lv_obj_t *pausedContinueButton = nullptr;
lv_obj_t *pausedContinueLabel = nullptr;
lv_obj_t *pausedEndButton = nullptr;
lv_obj_t *pausedEndLabel = nullptr;

roll_compass::CompassRenderModel currentModel;
roll_compass::NeedleSpring needleSpring;
PhysicalCompassEventCallback eventCallback = nullptr;
float targetNeedleAngleDegrees = 35.0f;
uint32_t lastTickMs = 0;
uint32_t accumulatedNeedleMs = 0;
uint32_t stateEnteredMs = 0;
uint32_t displayedSequence = 0;
bool bleEventsEnabled = false;
bool uiAwake = true;
roll_compass::NeedleStyle activeNeedleStyle = roll_compass::NeedleStyle::Source;

void setHidden(lv_obj_t *object, bool hidden) {
    if (object == nullptr) return;
    if (hidden) {
        lv_obj_add_flag(object, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_clear_flag(object, LV_OBJ_FLAG_HIDDEN);
    }
}

void positionInstrumentObject(lv_obj_t *object, const roll_compass::Rect &bounds) {
    if (object == nullptr) return;
    lv_obj_set_pos(object, bounds.x, bounds.y);
}

void updateTickGeometry() {
    for (size_t index = 0; index < somewhere_artwork::TICK_COUNT; ++index) {
        const somewhere_artwork::CompassTick &source = somewhere_artwork::TICKS[index];
        tickPoints[index][0] = lv_point_t{source.x1, source.y1};
        tickPoints[index][1] = lv_point_t{source.x2, source.y2};
        if (tickObjects[index] != nullptr) {
            lv_line_set_points(tickObjects[index], tickPoints[index], 2);
        }
    }
}

lv_color_t needleToneColor(roll_compass::NeedleTone tone) {
    switch (tone) {
        case roll_compass::NeedleTone::Pink: return kPink;
        case roll_compass::NeedleTone::OffWhite: return kOffWhite;
        case roll_compass::NeedleTone::Background: return kBackground;
    }
    return kPink;
}

void updateNeedleGeometry(float angleDegrees) {
    const roll_compass::NeedleVisual visual =
        roll_compass::buildNeedleVisual(activeNeedleStyle, angleDegrees);
    for (size_t index = 0; index < roll_compass::kNeedleMaximumStrokes; ++index) {
        lv_obj_t *object = needleStrokeObjects[index];
        if (object == nullptr) continue;
        const roll_compass::NeedleStroke &stroke = visual.strokes[index];
        if (stroke.visible) {
            for (size_t pointIndex = 0; pointIndex < stroke.pointCount; ++pointIndex) {
                needleStrokePoints[index][pointIndex] = lv_point_t{
                    stroke.points[pointIndex].x,
                    stroke.points[pointIndex].y,
                };
            }
            lv_line_set_points(
                object,
                needleStrokePoints[index],
                stroke.pointCount
            );
            lv_obj_set_style_line_color(
                object,
                needleToneColor(stroke.tone),
                LV_PART_MAIN
            );
            lv_obj_set_style_line_width(object, stroke.width, LV_PART_MAIN);
            lv_obj_set_style_line_opa(object, stroke.opacity, LV_PART_MAIN);
            lv_obj_set_style_line_rounded(object, stroke.rounded, LV_PART_MAIN);
        }
        setHidden(object, !stroke.visible || !currentModel.showNeedle);
    }
    for (size_t index = 0; index < roll_compass::kNeedleMaximumDiscs; ++index) {
        lv_obj_t *object = needleDiscObjects[index];
        if (object == nullptr) continue;
        const roll_compass::NeedleDisc &disc = visual.discs[index];
        if (disc.visible) {
            lv_obj_set_size(object, disc.diameter, disc.diameter);
            lv_obj_set_pos(
                object,
                disc.center.x - disc.diameter / 2,
                disc.center.y - disc.diameter / 2
            );
            lv_obj_set_style_bg_color(
                object,
                needleToneColor(disc.tone),
                LV_PART_MAIN
            );
            lv_obj_set_style_bg_opa(object, disc.opacity, LV_PART_MAIN);
        }
        setHidden(object, !disc.visible || !currentModel.showNeedle);
    }
}

void applyInstrumentLayout() {
    updateTickGeometry();
    updateNeedleGeometry(needleSpring.angleDegrees());
    positionInstrumentObject(northLabel, roll_compass::kInstrumentNorthBounds);
    positionInstrumentObject(southLabel, roll_compass::kInstrumentSouthBounds);
    positionInstrumentObject(westLabel, roll_compass::kInstrumentWestBounds);
    positionInstrumentObject(eastLabel, roll_compass::kInstrumentEastBounds);
    positionInstrumentObject(
        remainingLabel,
        roll_compass::kInstrumentRemainingLabelBounds
    );
    positionInstrumentObject(distanceValue, roll_compass::kInstrumentDistanceBounds);
    positionInstrumentObject(priceLabel, roll_compass::kInstrumentPriceLabelBounds);
    positionInstrumentObject(priceValue, roll_compass::kInstrumentPriceValueBounds);
    positionInstrumentObject(menuLabel, roll_compass::kInstrumentMenuLabelBounds);
    positionInstrumentObject(menuValue, roll_compass::kInstrumentMenuValueBounds);
    positionInstrumentObject(statusLabel, roll_compass::kInstrumentStatusBounds);
    positionInstrumentObject(primaryButton, roll_compass::kInstrumentPrimaryActionBounds);
    positionInstrumentObject(
        pausedContinueButton,
        roll_compass::kInstrumentPausedContinueBounds
    );
    positionInstrumentObject(pausedEndButton, roll_compass::kInstrumentPausedEndBounds);
}

lv_obj_t *makeLabel(
    lv_obj_t *parent,
    const roll_compass::Rect &bounds,
    const lv_font_t *font,
    lv_color_t color,
    lv_text_align_t align = LV_TEXT_ALIGN_CENTER
) {
    lv_obj_t *label = lv_label_create(parent);
    lv_obj_set_size(label, bounds.width, bounds.height);
    lv_obj_set_pos(label, bounds.x, bounds.y);
    lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
    lv_obj_set_style_text_color(label, color, LV_PART_MAIN);
    lv_obj_set_style_text_align(label, align, LV_PART_MAIN);
    lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP);
    lv_obj_clear_flag(label, LV_OBJ_FLAG_CLICKABLE);
    return label;
}

lv_obj_t *makeActionKey(
    lv_obj_t *parent,
    const roll_compass::Rect &bounds,
    lv_obj_t **labelOutput
) {
    lv_obj_t *button = lv_btn_create(parent);
    lv_obj_set_size(button, bounds.width, bounds.height);
    lv_obj_set_pos(button, bounds.x, bounds.y);
    lv_obj_set_style_radius(button, bounds.height / 2, LV_PART_MAIN);
    lv_obj_set_style_bg_color(button, kBackground, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(button, LV_OPA_20, LV_PART_MAIN);
    lv_obj_set_style_border_width(button, 1, LV_PART_MAIN);
    lv_obj_set_style_border_color(button, kGreen, LV_PART_MAIN);
    lv_obj_set_style_shadow_width(button, 0, LV_PART_MAIN);
    lv_obj_set_style_pad_all(button, 0, LV_PART_MAIN);
    lv_obj_clear_flag(button, LV_OBJ_FLAG_EVENT_BUBBLE);

    lv_obj_t *label = lv_label_create(button);
    lv_obj_set_style_text_font(label, &somewhere_font_small, LV_PART_MAIN);
    lv_obj_set_style_text_color(label, kGreen, LV_PART_MAIN);
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP);
    lv_obj_set_width(label, bounds.width - 8);
    lv_obj_center(label);
    *labelOutput = label;
    return button;
}

const char *stateCopy(roll_compass::CompassOsState state) {
    switch (state) {
        case roll_compass::CompassOsState::Boot: return "";
        case roll_compass::CompassOsState::Pairing: return "아이폰을 기다리는 중";
        case roll_compass::CompassOsState::SensorMissing: return "방향 센서를 연결해 주세요";
        case roll_compass::CompassOsState::Calibrating: return "나침반을 움직여 보정하세요";
        case roll_compass::CompassOsState::Ready: return "준비됐어요";
        case roll_compass::CompassOsState::Guiding: return "바늘을 따라가세요";
        case roll_compass::CompassOsState::Near: return "거의 다 왔어요";
        case roll_compass::CompassOsState::Paused: return "잠시 멈췄어요";
        case roll_compass::CompassOsState::Arrived: return "도착했어요";
        case roll_compass::CompassOsState::Stale: return "방향을 확인하는 중";
        case roll_compass::CompassOsState::MagneticAnomaly: return "자기장을 확인해 주세요";
        case roll_compass::CompassOsState::UpdateRequired: return "업데이트가 필요해요";
    }
    return "";
}

bool modelEquals(
    const roll_compass::CompassRenderModel &left,
    const roll_compass::CompassRenderModel &right
) {
    return left.state == right.state && left.showNeedle == right.showNeedle &&
        left.needleSuppressed == right.needleSuppressed &&
        left.targetNeedleAngleDegrees == right.targetNeedleAngleDegrees &&
        left.hasDistance == right.hasDistance && left.distanceM == right.distanceM &&
        left.actionMask == right.actionMask && strcmp(left.menu, right.menu) == 0 &&
        strcmp(left.priceBand, right.priceBand) == 0;
}

void setDataLabelText(lv_obj_t *label, const char *text, const lv_font_t *asciiFont) {
    lv_label_set_text(label, text);
    lv_obj_set_style_text_font(
        label,
        roll_compass::isAsciiDisplayText(text) ? asciiFont : &roll_compass_korean_16,
        LV_PART_MAIN
    );
}

void renderModel() {
    char distance[24] = {};
    char price[roll_compass::kPriceTextLimit * 4 + 1] = {};
    char menu[roll_compass::kDisplayTextLimit * 4 + 1] = {};
    roll_compass::formatDistanceMeters(
        currentModel.hasDistance ? currentModel.distanceM : -1.0f,
        distance,
        sizeof(distance)
    );
    roll_compass::formatPriceBand(currentModel.priceBand, price, sizeof(price));
    roll_compass::copyDisplayText(
        menu,
        sizeof(menu),
        currentModel.menu[0] == '\0' ? "--" : currentModel.menu
    );
    setDataLabelText(distanceValue, distance, &somewhere_font_distance);
    setDataLabelText(priceValue, price, &somewhere_font_small);
    setDataLabelText(menuValue, menu, &somewhere_font_small);

    const bool showStatus = currentModel.needleSuppressed ||
        (currentModel.state != roll_compass::CompassOsState::Ready &&
        currentModel.state != roll_compass::CompassOsState::Guiding &&
        currentModel.state != roll_compass::CompassOsState::Near);
    setHidden(statusLabel, !showStatus);
    const bool alert = currentModel.state == roll_compass::CompassOsState::SensorMissing ||
        currentModel.state == roll_compass::CompassOsState::MagneticAnomaly ||
        currentModel.state == roll_compass::CompassOsState::UpdateRequired;
    const bool success = currentModel.state == roll_compass::CompassOsState::Arrived;
    lv_label_set_text(
        statusLabel,
        currentModel.needleSuppressed &&
                currentModel.state == roll_compass::CompassOsState::Guiding
            ? "경로를 확인하는 중"
            : stateCopy(currentModel.state)
    );
    lv_obj_set_style_text_color(
        statusLabel,
        alert ? kPink : success ? kGreen : kOffWhite,
        LV_PART_MAIN
    );

    updateNeedleGeometry(needleSpring.angleDegrees());

    const bool showStop =
        (currentModel.state == roll_compass::CompassOsState::Guiding ||
         currentModel.state == roll_compass::CompassOsState::Near) &&
        (currentModel.actionMask & kStopAction) != 0;
    const bool showReveal = currentModel.state == roll_compass::CompassOsState::Arrived &&
        (currentModel.actionMask & kRevealAction) != 0;
    setHidden(primaryButton, !showStop && !showReveal);
    if (showStop) {
        lv_label_set_text(primaryButtonLabel, "STOP");
        lv_obj_set_style_text_font(primaryButtonLabel, &somewhere_font_small, LV_PART_MAIN);
        lv_obj_set_style_border_color(primaryButton, kPink, LV_PART_MAIN);
        lv_obj_set_style_text_color(primaryButtonLabel, kPink, LV_PART_MAIN);
    } else if (showReveal) {
        lv_label_set_text(primaryButtonLabel, "아이폰에서 확인하기");
        lv_obj_set_style_text_font(
            primaryButtonLabel,
            &roll_compass_korean_16,
            LV_PART_MAIN
        );
        lv_obj_set_style_border_color(primaryButton, kGreen, LV_PART_MAIN);
        lv_obj_set_style_text_color(primaryButtonLabel, kGreen, LV_PART_MAIN);
    }

    const bool paused = currentModel.state == roll_compass::CompassOsState::Paused;
    setHidden(
        pausedContinueButton,
        !paused || (currentModel.actionMask & kContinueAction) == 0
    );
    setHidden(
        pausedEndButton,
        !paused || (currentModel.actionMask & kConfirmStopAction) == 0
    );
}

void dispatchAction(const char *action, uint8_t requiredMask) {
    if (uiAwake && eventCallback != nullptr && bleEventsEnabled &&
        (currentModel.actionMask & requiredMask) != 0) {
        eventCallback(action, displayedSequence);
    }
}

void primaryClicked(lv_event_t *) {
    if (currentModel.state == roll_compass::CompassOsState::Guiding ||
        currentModel.state == roll_compass::CompassOsState::Near) {
        dispatchAction("stop", kStopAction);
    } else if (currentModel.state == roll_compass::CompassOsState::Arrived) {
        dispatchAction("reveal", kRevealAction);
    }
}

void pausedContinueClicked(lv_event_t *) {
    dispatchAction("continue", kContinueAction);
}

void pausedEndClicked(lv_event_t *) {
    dispatchAction("confirm-stop", kConfirmStopAction);
}

void needleStyleClicked(lv_event_t *) {
    if (!uiAwake) return;
    activeNeedleStyle = roll_compass::nextNeedleStyle(activeNeedleStyle);
    updateNeedleGeometry(needleSpring.angleDegrees());
}

void animateState(uint32_t nowMs) {
    if (stateEnteredMs == 0) stateEnteredMs = nowMs;
    const bool pulseState = currentModel.state == roll_compass::CompassOsState::Pairing ||
        currentModel.state == roll_compass::CompassOsState::Calibrating ||
        currentModel.state == roll_compass::CompassOsState::Stale;
    const float wave = (sinf(static_cast<float>(nowMs) / 520.0f) + 1.0f) * 0.5f;
    const lv_opa_t opacity = pulseState
        ? static_cast<lv_opa_t>(150.0f + wave * 105.0f)
        : static_cast<lv_opa_t>(LV_OPA_COVER);
    if (statusLabel != nullptr && !pulseState) {
        lv_obj_set_style_text_opa(statusLabel, LV_OPA_COVER, LV_PART_MAIN);
    } else if (statusLabel != nullptr) {
        lv_obj_set_style_text_opa(statusLabel, opacity, LV_PART_MAIN);
    }
}

void animateNeedle(uint32_t nowMs) {
    if (lastTickMs == 0) {
        lastTickMs = nowMs;
        return;
    }
    const uint32_t elapsedMs = nowMs - lastTickMs;
    lastTickMs = nowMs;
    accumulatedNeedleMs += elapsedMs > 100U ? 100U : elapsedMs;
    uint8_t steps = 0;
    while (accumulatedNeedleMs >= kNeedleStepMs && steps < kMaximumCatchUpSteps) {
        needleSpring.step(targetNeedleAngleDegrees, 0.025f);
        accumulatedNeedleMs -= kNeedleStepMs;
        ++steps;
    }
    if (steps == kMaximumCatchUpSteps && accumulatedNeedleMs >= kNeedleStepMs) {
        accumulatedNeedleMs %= kNeedleStepMs;
    }
    updateNeedleGeometry(needleSpring.angleDegrees());
}

}  // namespace

void displayUiBegin() {
    lv_obj_t *screen = lv_scr_act();
    lv_obj_set_style_bg_color(screen, kBackground, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_clear_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_clear_flag(screen, LV_OBJ_FLAG_CLICKABLE);

    faceBackground = lv_obj_create(screen);
    lv_obj_remove_style_all(faceBackground);
    lv_obj_set_size(faceBackground, kScreenSize, kScreenSize);
    lv_obj_set_pos(faceBackground, 0, 0);
    lv_obj_set_style_radius(faceBackground, LV_RADIUS_CIRCLE, LV_PART_MAIN);
    lv_obj_set_style_bg_color(faceBackground, kBackground, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(faceBackground, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_add_flag(faceBackground, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(
        faceBackground,
        needleStyleClicked,
        LV_EVENT_CLICKED,
        nullptr
    );

    for (size_t index = 0; index < somewhere_artwork::TICK_COUNT; ++index) {
        tickObjects[index] = lv_line_create(screen);
        lv_obj_remove_style_all(tickObjects[index]);
        lv_obj_set_size(tickObjects[index], kScreenSize, kScreenSize);
        lv_obj_set_pos(tickObjects[index], 0, 0);
        lv_obj_set_style_line_color(tickObjects[index], kOffWhite, LV_PART_MAIN);
        lv_obj_set_style_line_width(tickObjects[index], 1, LV_PART_MAIN);
        lv_obj_set_style_line_rounded(tickObjects[index], false, LV_PART_MAIN);
        lv_obj_clear_flag(tickObjects[index], LV_OBJ_FLAG_CLICKABLE);
    }

    for (size_t index = 0; index < roll_compass::kNeedleMaximumStrokes; ++index) {
        needleStrokeObjects[index] = lv_line_create(screen);
        lv_obj_remove_style_all(needleStrokeObjects[index]);
        lv_obj_set_size(needleStrokeObjects[index], kScreenSize, kScreenSize);
        lv_obj_set_pos(needleStrokeObjects[index], 0, 0);
        lv_obj_clear_flag(needleStrokeObjects[index], LV_OBJ_FLAG_CLICKABLE);
    }
    for (size_t index = 0; index < roll_compass::kNeedleMaximumDiscs; ++index) {
        needleDiscObjects[index] = lv_obj_create(screen);
        lv_obj_remove_style_all(needleDiscObjects[index]);
        lv_obj_set_style_radius(
            needleDiscObjects[index],
            LV_RADIUS_CIRCLE,
            LV_PART_MAIN
        );
        lv_obj_clear_flag(needleDiscObjects[index], LV_OBJ_FLAG_CLICKABLE);
    }

    northLabel = makeLabel(
        screen,
        roll_compass::kInstrumentNorthBounds,
        &somewhere_font_direction,
        kCardinalWhite
    );
    southLabel = makeLabel(
        screen,
        roll_compass::kInstrumentSouthBounds,
        &somewhere_font_direction,
        kCardinalWhite
    );
    westLabel = makeLabel(
        screen,
        roll_compass::kInstrumentWestBounds,
        &somewhere_font_direction,
        kCardinalWhite
    );
    eastLabel = makeLabel(
        screen,
        roll_compass::kInstrumentEastBounds,
        &somewhere_font_direction,
        kCardinalWhite
    );
    lv_label_set_text(northLabel, "N");
    lv_label_set_text(southLabel, "S");
    lv_label_set_text(westLabel, "W");
    lv_label_set_text(eastLabel, "E");

    remainingLabel = makeLabel(
        screen,
        roll_compass::kInstrumentRemainingLabelBounds,
        &somewhere_font_label,
        kGreen
    );
    priceLabel = makeLabel(
        screen,
        roll_compass::kInstrumentPriceLabelBounds,
        &somewhere_font_label,
        kGreen,
        LV_TEXT_ALIGN_LEFT
    );
    menuLabel = makeLabel(
        screen,
        roll_compass::kInstrumentMenuLabelBounds,
        &somewhere_font_label,
        kGreen,
        LV_TEXT_ALIGN_RIGHT
    );
    lv_label_set_text(remainingLabel, "REMAINING");
    lv_label_set_text(priceLabel, "PRICE");
    lv_label_set_text(menuLabel, "MENU");
    lv_obj_set_style_text_opa(remainingLabel, kReadoutLabelOpacity, LV_PART_MAIN);
    lv_obj_set_style_text_opa(priceLabel, kReadoutLabelOpacity, LV_PART_MAIN);
    lv_obj_set_style_text_opa(menuLabel, kReadoutLabelOpacity, LV_PART_MAIN);

    distanceValue = makeLabel(
        screen,
        roll_compass::kInstrumentDistanceBounds,
        &somewhere_font_distance,
        kGreen
    );
    priceValue = makeLabel(
        screen,
        roll_compass::kInstrumentPriceValueBounds,
        &somewhere_font_small,
        kGreen,
        LV_TEXT_ALIGN_LEFT
    );
    menuValue = makeLabel(
        screen,
        roll_compass::kInstrumentMenuValueBounds,
        &somewhere_font_small,
        kGreen,
        LV_TEXT_ALIGN_RIGHT
    );
    lv_obj_set_style_text_opa(distanceValue, kReadoutValueOpacity, LV_PART_MAIN);
    lv_obj_set_style_text_opa(priceValue, kReadoutValueOpacity, LV_PART_MAIN);
    lv_obj_set_style_text_opa(menuValue, kReadoutValueOpacity, LV_PART_MAIN);
    statusLabel = makeLabel(
        screen,
        roll_compass::kInstrumentStatusBounds,
        &roll_compass_korean_20,
        kOffWhite
    );
    primaryButton = makeActionKey(
        screen,
        roll_compass::kInstrumentPrimaryActionBounds,
        &primaryButtonLabel
    );
    pausedContinueButton = makeActionKey(
        screen,
        roll_compass::kInstrumentPausedContinueBounds,
        &pausedContinueLabel
    );
    pausedEndButton = makeActionKey(
        screen,
        roll_compass::kInstrumentPausedEndBounds,
        &pausedEndLabel
    );
    lv_label_set_text(pausedContinueLabel, "계속하기");
    lv_obj_set_style_text_font(pausedContinueLabel, &roll_compass_korean_16, LV_PART_MAIN);
    lv_label_set_text(pausedEndLabel, "여정 끝내기");
    lv_obj_set_style_text_font(pausedEndLabel, &roll_compass_korean_16, LV_PART_MAIN);
    lv_obj_set_style_border_color(pausedEndButton, kPink, LV_PART_MAIN);
    lv_obj_set_style_text_color(pausedEndLabel, kPink, LV_PART_MAIN);
    lv_obj_add_event_cb(primaryButton, primaryClicked, LV_EVENT_CLICKED, nullptr);
    lv_obj_add_event_cb(
        pausedContinueButton,
        pausedContinueClicked,
        LV_EVENT_CLICKED,
        nullptr
    );
    lv_obj_add_event_cb(pausedEndButton, pausedEndClicked, LV_EVENT_CLICKED, nullptr);

    needleSpring.reset(35.0f);
    applyInstrumentLayout();
    renderModel();
}

void displayUiSetModel(
    const roll_compass::CompassRenderModel &model,
    uint32_t sourceSequence,
    bool allowBleEvents
) {
    if (lvgl_port_lock(-1)) {
        const bool stateChanged = model.state != currentModel.state;
        const bool shouldRender = !modelEquals(model, currentModel);
        currentModel = model;
        displayedSequence = sourceSequence;
        bleEventsEnabled = allowBleEvents;
        if (currentModel.showNeedle) {
            targetNeedleAngleDegrees =
                roll_compass::normalizeDegrees(currentModel.targetNeedleAngleDegrees);
        }
        if (stateChanged) stateEnteredMs = 0;
        if (shouldRender) renderModel();
        lvgl_port_unlock();
    }
}

void displayUiTick(uint32_t nowMs) {
    if (lvgl_port_lock(-1)) {
        animateNeedle(nowMs);
        animateState(nowMs);
        lvgl_port_unlock();
    }
}

void displayUiSetEventCallback(PhysicalCompassEventCallback callback) {
    eventCallback = callback;
}

bool displayUiSetAwake(bool awake) {
    if (!lvgl_port_lock(-1)) return false;
    const bool updated = lvgl_port_set_touch_enabled(awake);
    if (updated) uiAwake = awake;
    lvgl_port_unlock();
    return updated;
}
