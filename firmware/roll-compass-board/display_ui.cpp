#include "display_ui.h"

#include <lvgl.h>
#include <math.h>
#include <stdio.h>

#include "compass_asset_metrics.h"
#include "compass_assets.h"
#include "compass_layout.h"
#include "compass_math.h"
#include "lvgl_v8_port.h"
#include "needle_spring.h"

LV_FONT_DECLARE(roll_compass_wordmark_font)
LV_FONT_DECLARE(roll_compass_korean_16)
LV_FONT_DECLARE(roll_compass_korean_20)

namespace {

constexpr uint8_t kMountRotationStepDegrees = 10;
constexpr uint8_t kMaximumMountRotationDegrees = 30;
constexpr uint32_t kNeedleStepMs = 25;
constexpr uint8_t kMaximumCatchUpSteps = 4;
constexpr uint8_t kStopAction = 1U << 0;
constexpr uint8_t kContinueAction = 1U << 1;
constexpr uint8_t kConfirmStopAction = 1U << 2;
constexpr uint8_t kRevealAction = 1U << 3;

const lv_color_t kCanvas = lv_color_hex(0xF8F3E8);
const lv_color_t kInk = lv_color_hex(0x2A211A);
const lv_color_t kMutedInk = lv_color_hex(0x77685B);
const lv_color_t kBrass = lv_color_hex(0xB6863A);
const lv_color_t kBrassLight = lv_color_hex(0xD9BB78);
const lv_color_t kOxblood = lv_color_hex(0x8E1E22);
const lv_color_t kPaperBright = lv_color_hex(0xFFF9ED);
const lv_color_t kSage = lv_color_hex(0x35685E);

lv_obj_t *compassShell = nullptr;
lv_obj_t *glowRing = nullptr;
lv_obj_t *compassNeedle = nullptr;
lv_obj_t *ghostNeedle = nullptr;
lv_obj_t *calibrationArc = nullptr;
lv_obj_t *brandLabel = nullptr;
lv_obj_t *statusLabel = nullptr;
lv_obj_t *mountAngleLabel = nullptr;
lv_obj_t *distanceGroup = nullptr;
lv_obj_t *distanceValue = nullptr;
lv_obj_t *primaryButton = nullptr;
lv_obj_t *primaryButtonLabel = nullptr;
lv_obj_t *pausedContinueButton = nullptr;
lv_obj_t *pausedContinueLabel = nullptr;
lv_obj_t *pausedEndButton = nullptr;
lv_obj_t *pausedEndLabel = nullptr;

roll_compass::CompassRenderModel currentModel;
roll_compass::NeedleSpring needleSpring;
PhysicalCompassEventCallback eventCallback = nullptr;
float targetNeedleAngleDegrees = 0.0f;
uint32_t lastTickMs = 0;
uint32_t accumulatedNeedleMs = 0;
uint32_t stateEnteredMs = 0;
uint32_t displayedSequence = 0;
uint8_t mountRotationDegrees = 0;
bool bleEventsEnabled = false;
bool uiAwake = true;

int16_t mountRotationTenths() {
    return static_cast<int16_t>(mountRotationDegrees) * 10;
}

int16_t mountedImageAngle(float contentAngleDegrees) {
    const int32_t angle = static_cast<int32_t>(lroundf(contentAngleDegrees * 10.0f)) +
        mountRotationTenths();
    return static_cast<int16_t>((angle % 3600 + 3600) % 3600);
}

void setHidden(lv_obj_t *object, bool hidden) {
    if (object == nullptr) return;
    if (hidden) {
        lv_obj_add_flag(object, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_clear_flag(object, LV_OBJ_FLAG_HIDDEN);
    }
}

void positionMountedObject(lv_obj_t *object, const roll_compass::Rect &bounds) {
    if (object == nullptr) return;
    constexpr float displayCenter = 240.0f;
    const float radians =
        static_cast<float>(mountRotationDegrees) * static_cast<float>(M_PI) / 180.0f;
    const float cosine = cosf(radians);
    const float sine = sinf(radians);
    const float centerX =
        static_cast<float>(bounds.x) + static_cast<float>(bounds.width) * 0.5f;
    const float centerY =
        static_cast<float>(bounds.y) + static_cast<float>(bounds.height) * 0.5f;
    const float deltaX = centerX - displayCenter;
    const float deltaY = centerY - displayCenter;
    const float mountedCenterX = displayCenter + deltaX * cosine - deltaY * sine;
    const float mountedCenterY = displayCenter + deltaX * sine + deltaY * cosine;
    lv_obj_set_pos(
        object,
        static_cast<lv_coord_t>(lroundf(mountedCenterX - bounds.width * 0.5f)),
        static_cast<lv_coord_t>(lroundf(mountedCenterY - bounds.height * 0.5f))
    );
    lv_obj_set_style_transform_pivot_x(object, bounds.width / 2, LV_PART_MAIN);
    lv_obj_set_style_transform_pivot_y(object, bounds.height / 2, LV_PART_MAIN);
    lv_obj_set_style_transform_angle(object, mountRotationTenths(), LV_PART_MAIN);
}

void applyMountRotation() {
    if (compassShell != nullptr) lv_img_set_angle(compassShell, mountRotationTenths());
    if (compassNeedle != nullptr) {
        lv_img_set_angle(compassNeedle, mountedImageAngle(needleSpring.angleDegrees()));
    }
    positionMountedObject(brandLabel, roll_compass::kBrandBounds);
    positionMountedObject(statusLabel, roll_compass::kStatusBounds);
    positionMountedObject(distanceGroup, roll_compass::kDistanceBounds);
    positionMountedObject(primaryButton, roll_compass::kPrimaryActionBounds);
    positionMountedObject(pausedContinueButton, roll_compass::kPausedContinueBounds);
    positionMountedObject(pausedEndButton, roll_compass::kPausedEndBounds);
    positionMountedObject(mountAngleLabel, roll_compass::Rect{176, 110, 128, 18});
    if (mountAngleLabel != nullptr) {
        char copy[24];
        snprintf(copy, sizeof(copy), "MOUNT %u DEG", mountRotationDegrees);
        lv_label_set_text(mountAngleLabel, copy);
    }
}

lv_obj_t *makeLabel(
    lv_obj_t *parent,
    const roll_compass::Rect &bounds,
    const lv_font_t *font,
    lv_color_t color
) {
    lv_obj_t *label = lv_label_create(parent);
    lv_obj_set_size(label, bounds.width, bounds.height);
    lv_obj_set_pos(label, bounds.x, bounds.y);
    lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
    lv_obj_set_style_text_color(label, color, LV_PART_MAIN);
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP);
    lv_obj_clear_flag(label, LV_OBJ_FLAG_CLICKABLE);
    return label;
}

lv_obj_t *makeSoftKey(
    lv_obj_t *parent,
    const roll_compass::Rect &bounds,
    lv_obj_t **labelOutput
) {
    lv_obj_t *button = lv_btn_create(parent);
    lv_obj_set_size(button, bounds.width, bounds.height);
    lv_obj_set_pos(button, bounds.x, bounds.y);
    lv_obj_set_style_radius(button, bounds.height / 2, LV_PART_MAIN);
    lv_obj_set_style_bg_color(button, kPaperBright, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(button, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_border_width(button, 1, LV_PART_MAIN);
    lv_obj_set_style_border_color(button, kBrassLight, LV_PART_MAIN);
    lv_obj_set_style_shadow_width(button, 9, LV_PART_MAIN);
    lv_obj_set_style_shadow_color(button, kBrass, LV_PART_MAIN);
    lv_obj_set_style_shadow_opa(button, LV_OPA_20, LV_PART_MAIN);
    lv_obj_set_style_pad_all(button, 0, LV_PART_MAIN);
    lv_obj_clear_flag(button, LV_OBJ_FLAG_EVENT_BUBBLE);

    lv_obj_t *label = lv_label_create(button);
    lv_obj_set_style_text_font(label, &roll_compass_korean_16, LV_PART_MAIN);
    lv_obj_set_style_text_color(label, kInk, LV_PART_MAIN);
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
        left.targetNeedleAngleDegrees == right.targetNeedleAngleDegrees &&
        left.hasDistance == right.hasDistance && left.distanceM == right.distanceM &&
        left.actionMask == right.actionMask;
}

void renderModel() {
    lv_label_set_text(statusLabel, stateCopy(currentModel.state));
    const bool alert = currentModel.state == roll_compass::CompassOsState::SensorMissing ||
        currentModel.state == roll_compass::CompassOsState::MagneticAnomaly ||
        currentModel.state == roll_compass::CompassOsState::UpdateRequired;
    const bool success = currentModel.state == roll_compass::CompassOsState::Near ||
        currentModel.state == roll_compass::CompassOsState::Arrived;
    lv_obj_set_style_text_color(
        statusLabel,
        alert ? kOxblood : success ? kSage : kInk,
        LV_PART_MAIN
    );

    setHidden(compassNeedle, !currentModel.showNeedle);
    setHidden(distanceGroup, !currentModel.hasDistance);
    if (currentModel.hasDistance) {
        char distance[24];
        if (currentModel.distanceM >= 1000.0f) {
            snprintf(distance, sizeof(distance), "%.1f km", currentModel.distanceM / 1000.0f);
        } else {
            snprintf(distance, sizeof(distance), "%.0f m", currentModel.distanceM);
        }
        lv_label_set_text(distanceValue, distance);
    }

    const bool showStop =
        (currentModel.state == roll_compass::CompassOsState::Guiding ||
         currentModel.state == roll_compass::CompassOsState::Near) &&
        (currentModel.actionMask & kStopAction) != 0;
    const bool showReveal = currentModel.state == roll_compass::CompassOsState::Arrived &&
        (currentModel.actionMask & kRevealAction) != 0;
    setHidden(primaryButton, !showStop && !showReveal);
    if (showStop) {
        lv_label_set_text(primaryButtonLabel, "STOP");
        lv_obj_set_style_text_font(primaryButtonLabel, &lv_font_montserrat_14, LV_PART_MAIN);
        lv_obj_set_style_bg_color(primaryButton, kOxblood, LV_PART_MAIN);
        lv_obj_set_style_text_color(primaryButtonLabel, kPaperBright, LV_PART_MAIN);
    } else if (showReveal) {
        lv_label_set_text(primaryButtonLabel, "아이폰에서 확인하기");
        lv_obj_set_style_text_font(
            primaryButtonLabel,
            &roll_compass_korean_16,
            LV_PART_MAIN
        );
        lv_obj_set_style_bg_color(primaryButton, kBrass, LV_PART_MAIN);
        lv_obj_set_style_text_color(primaryButtonLabel, kPaperBright, LV_PART_MAIN);
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
    setHidden(
        calibrationArc,
        currentModel.state != roll_compass::CompassOsState::Calibrating
    );
    const bool showGhost = currentModel.state == roll_compass::CompassOsState::Boot ||
        currentModel.state == roll_compass::CompassOsState::Calibrating ||
        currentModel.state == roll_compass::CompassOsState::Arrived;
    setHidden(ghostNeedle, !showGhost);
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

void displayTapped(lv_event_t *) {
    if (!uiAwake) return;
    mountRotationDegrees = mountRotationDegrees >= kMaximumMountRotationDegrees
        ? 0
        : static_cast<uint8_t>(mountRotationDegrees + kMountRotationStepDegrees);
    applyMountRotation();
}

void animateState(uint32_t nowMs) {
    if (stateEnteredMs == 0) stateEnteredMs = nowMs;
    const uint32_t stateAgeMs = nowMs - stateEnteredMs;
    const float wave = (sinf(static_cast<float>(nowMs) / 520.0f) + 1.0f) * 0.5f;
    const lv_opa_t shellOpacity = currentModel.state == roll_compass::CompassOsState::Boot
        ? static_cast<lv_opa_t>(fminf(255.0f, stateAgeMs * 0.3f))
        : static_cast<lv_opa_t>(LV_OPA_COVER);
    lv_obj_set_style_img_opa(compassShell, shellOpacity, LV_PART_MAIN);

    lv_opa_t ringOpacity = LV_OPA_20;
    if (currentModel.state == roll_compass::CompassOsState::Pairing) {
        ringOpacity = static_cast<lv_opa_t>(45 + wave * 90);
    } else if (currentModel.showNeedle) {
        ringOpacity = static_cast<lv_opa_t>(95 + wave * 70);
    }
    lv_obj_set_style_arc_opa(glowRing, ringOpacity, LV_PART_MAIN);

    if (currentModel.state == roll_compass::CompassOsState::Boot) {
        const float sweep =
            fminf(1.0f, static_cast<float>(stateAgeMs) / 900.0f) * 120.0f - 60.0f;
        lv_img_set_angle(ghostNeedle, mountedImageAngle(sweep));
        lv_obj_set_style_img_opa(ghostNeedle, LV_OPA_50, LV_PART_MAIN);
    } else if (currentModel.state == roll_compass::CompassOsState::Calibrating) {
        lv_img_set_angle(
            ghostNeedle,
            mountedImageAngle(static_cast<float>(nowMs % 2400U) * 0.15f)
        );
        lv_obj_set_style_img_opa(
            ghostNeedle,
            static_cast<lv_opa_t>(55 + wave * 80),
            LV_PART_MAIN
        );
        const uint16_t start = static_cast<uint16_t>((nowMs / 12U) % 360U);
        lv_arc_set_angles(
            calibrationArc,
            start,
            static_cast<uint16_t>((start + 82U) % 360U)
        );
    } else if (currentModel.state == roll_compass::CompassOsState::Arrived) {
        if (stateAgeMs < 1200U) {
            setHidden(ghostNeedle, false);
            lv_img_set_angle(ghostNeedle, mountedImageAngle(0.0f));
            lv_obj_set_style_img_opa(
                ghostNeedle,
                static_cast<lv_opa_t>(70 + wave * 70),
                LV_PART_MAIN
            );
        } else {
            setHidden(ghostNeedle, true);
        }
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
    if (compassNeedle != nullptr) {
        lv_img_set_angle(
            compassNeedle,
            mountedImageAngle(needleSpring.angleDegrees())
        );
    }
}

}  // namespace

void displayUiBegin() {
    lv_obj_t *screen = lv_scr_act();
    lv_obj_set_style_bg_color(screen, kCanvas, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_clear_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(screen, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(screen, displayTapped, LV_EVENT_CLICKED, nullptr);

    compassShell = lv_img_create(screen);
    lv_img_set_src(compassShell, &rollCompassShellImage);
    lv_obj_set_pos(compassShell, 0, 0);
    lv_img_set_pivot(
        compassShell,
        roll_compass_assets::kScreenHubX,
        roll_compass_assets::kScreenHubY
    );
    lv_img_set_angle(compassShell, 0);
    lv_img_set_antialias(compassShell, true);
    lv_obj_clear_flag(compassShell, LV_OBJ_FLAG_CLICKABLE);

    glowRing = lv_arc_create(screen);
    lv_obj_remove_style_all(glowRing);
    lv_obj_set_size(glowRing, 438, 438);
    lv_obj_center(glowRing);
    lv_arc_set_bg_angles(glowRing, 0, 359);
    lv_arc_set_angles(glowRing, 0, 359);
    lv_obj_set_style_arc_color(glowRing, kBrassLight, LV_PART_MAIN);
    lv_obj_set_style_arc_width(glowRing, 4, LV_PART_MAIN);
    lv_obj_set_style_arc_rounded(glowRing, true, LV_PART_MAIN);
    lv_obj_clear_flag(glowRing, LV_OBJ_FLAG_CLICKABLE);

    ghostNeedle = lv_img_create(screen);
    lv_img_set_src(ghostNeedle, &rollCompassNeedleImage);
    lv_obj_set_pos(
        ghostNeedle,
        roll_compass_assets::kNeedleScreenX,
        roll_compass_assets::kNeedleScreenY
    );
    lv_img_set_pivot(
        ghostNeedle,
        roll_compass_assets::kNeedlePivotX,
        roll_compass_assets::kNeedlePivotY
    );
    lv_img_set_antialias(ghostNeedle, true);
    lv_obj_set_style_img_recolor(ghostNeedle, kBrass, LV_PART_MAIN);
    lv_obj_set_style_img_recolor_opa(ghostNeedle, LV_OPA_80, LV_PART_MAIN);
    lv_obj_clear_flag(ghostNeedle, LV_OBJ_FLAG_CLICKABLE);

    compassNeedle = lv_img_create(screen);
    lv_img_set_src(compassNeedle, &rollCompassNeedleImage);
    lv_obj_set_pos(
        compassNeedle,
        roll_compass_assets::kNeedleScreenX,
        roll_compass_assets::kNeedleScreenY
    );
    lv_img_set_pivot(
        compassNeedle,
        roll_compass_assets::kNeedlePivotX,
        roll_compass_assets::kNeedlePivotY
    );
    lv_img_set_angle(compassNeedle, 0);
    lv_img_set_antialias(compassNeedle, true);
    lv_obj_clear_flag(compassNeedle, LV_OBJ_FLAG_CLICKABLE);

    calibrationArc = lv_arc_create(screen);
    lv_obj_remove_style_all(calibrationArc);
    lv_obj_set_size(calibrationArc, 390, 390);
    lv_obj_center(calibrationArc);
    lv_obj_set_style_arc_color(calibrationArc, kBrass, LV_PART_MAIN);
    lv_obj_set_style_arc_width(calibrationArc, 5, LV_PART_MAIN);
    lv_obj_set_style_arc_rounded(calibrationArc, true, LV_PART_MAIN);
    lv_obj_clear_flag(calibrationArc, LV_OBJ_FLAG_CLICKABLE);

    brandLabel = makeLabel(
        screen,
        roll_compass::kBrandBounds,
        &roll_compass_wordmark_font,
        kInk
    );
    lv_label_set_text(brandLabel, "Roll the compass");

    statusLabel = makeLabel(
        screen,
        roll_compass::kStatusBounds,
        &roll_compass_korean_20,
        kInk
    );
    mountAngleLabel = makeLabel(
        screen,
        roll_compass::Rect{176, 110, 128, 18},
        &lv_font_montserrat_10,
        kBrass
    );
    lv_obj_set_style_text_letter_space(mountAngleLabel, 1, LV_PART_MAIN);

    distanceGroup = lv_obj_create(screen);
    lv_obj_remove_style_all(distanceGroup);
    lv_obj_set_size(
        distanceGroup,
        roll_compass::kDistanceBounds.width,
        roll_compass::kDistanceBounds.height
    );
    lv_obj_set_pos(
        distanceGroup,
        roll_compass::kDistanceBounds.x,
        roll_compass::kDistanceBounds.y
    );
    lv_obj_clear_flag(distanceGroup, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_t *distanceCaption = makeLabel(
        distanceGroup,
        roll_compass::Rect{0, 0, roll_compass::kDistanceBounds.width, 20},
        &roll_compass_korean_16,
        kMutedInk
    );
    lv_label_set_text(distanceCaption, "남은 거리");
    distanceValue = makeLabel(
        distanceGroup,
        roll_compass::Rect{0, 21, roll_compass::kDistanceBounds.width, 34},
        &lv_font_montserrat_24,
        kInk
    );

    primaryButton = makeSoftKey(
        screen,
        roll_compass::kPrimaryActionBounds,
        &primaryButtonLabel
    );
    pausedContinueButton = makeSoftKey(
        screen,
        roll_compass::kPausedContinueBounds,
        &pausedContinueLabel
    );
    lv_label_set_text(pausedContinueLabel, "계속하기");
    pausedEndButton = makeSoftKey(
        screen,
        roll_compass::kPausedEndBounds,
        &pausedEndLabel
    );
    lv_label_set_text(pausedEndLabel, "여정 끝내기");
    lv_obj_set_style_bg_color(pausedEndButton, kOxblood, LV_PART_MAIN);
    lv_obj_set_style_text_color(pausedEndLabel, kPaperBright, LV_PART_MAIN);
    lv_obj_add_event_cb(primaryButton, primaryClicked, LV_EVENT_CLICKED, nullptr);
    lv_obj_add_event_cb(
        pausedContinueButton,
        pausedContinueClicked,
        LV_EVENT_CLICKED,
        nullptr
    );
    lv_obj_add_event_cb(pausedEndButton, pausedEndClicked, LV_EVENT_CLICKED, nullptr);

    needleSpring.reset(0.0f);
    applyMountRotation();
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
