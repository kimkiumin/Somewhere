#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <initializer_list>

#include "compass_artwork.h"
#include "instrument_line.h"

static lv_color_t drawBuffer[480 * 480];
static lv_color_t pixels[480 * 480];
static lv_color_t referencePixels[480 * 480];
static uint32_t flushedPixels = 0;

static void flush(lv_disp_drv_t *driver, const lv_area_t *area, lv_color_t *colors) {
    const int width = area->x2 - area->x1 + 1;
    for (int y = area->y1; y <= area->y2; ++y) {
        memcpy(pixels + y * 480 + area->x1, colors, width * sizeof(lv_color_t));
        colors += width;
    }
    flushedPixels += width * (area->y2 - area->y1 + 1);
    lv_disp_flush_ready(driver);
}

static lv_obj_t *makeLine(int width, bool rounded) {
    lv_obj_t *line = lv_line_create(lv_scr_act());
    lv_obj_remove_style_all(line);
    lv_obj_set_style_line_width(line, width, LV_PART_MAIN);
    lv_obj_set_style_line_color(line, lv_color_hex(0xff3850), LV_PART_MAIN);
    lv_obj_set_style_line_rounded(line, rounded, LV_PART_MAIN);
    return line;
}

static void render() {
    flushedPixels = 0;
    lv_refr_now(nullptr);
}

int main() {
    lv_init();
    static lv_disp_draw_buf_t buffers;
    lv_disp_draw_buf_init(&buffers, drawBuffer, nullptr, 480 * 480);
    static lv_disp_drv_t driver;
    lv_disp_drv_init(&driver);
    driver.hor_res = driver.ver_res = 480;
    driver.draw_buf = &buffers;
    driver.flush_cb = flush;
    lv_disp_drv_register(&driver);
    lv_obj_remove_style_all(lv_scr_act());
    lv_obj_set_style_bg_color(lv_scr_act(), lv_color_hex(0x050706), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(lv_scr_act(), LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_clear_flag(lv_scr_act(), LV_OBJ_FLAG_SCROLLABLE);
    render();

    // Reproduce the shipped renderer's full-screen dirty region for one tick.
    lv_obj_t *legacy = makeLine(1, false);
    lv_point_t oldPoints[2] = {{22, 240}, {47, 240}};
    lv_obj_set_size(legacy, 480, 480);
    lv_line_set_points(legacy, oldPoints, 2);
    render();
    memcpy(referencePixels, pixels, sizeof(pixels));
    lv_line_set_points(legacy, oldPoints, 2);
    render();
    assert(flushedPixels == 480 * 480);
    const auto oldDirtyPixels = flushedPixels;
    lv_obj_del(legacy);
    render();

    lv_obj_t *line = makeLine(1, false);
    roll_compass::InstrumentLine<3> geometry;
    roll_compass::InstrumentPoint points[3] = {{22, 240}, {47, 240}};
    assert(geometry.update(line, points, 2));
    render();
    assert(memcmp(pixels, referencePixels, sizeof(pixels)) == 0);
    assert(!geometry.update(line, points, 2));
    render();
    assert(flushedPixels == 0);

    points[0].y = points[1].y = 241;
    assert(geometry.update(line, points, 2));
    render();
    assert(flushedPixels > 0 && flushedPixels < 1024);
    printf("tick redraw: legacy=%u px, unchanged=0 px, moved=%u px\n",
        oldDirtyPixels, flushedPixels);
    lv_obj_del(line);
    render();

    // Moving/shrinking lines must erase the old stroke and retain exact pixels.
    // Compare real LVGL raster output, not an approximation of its drawing API.
    for (int width : {1, 2, 9}) {
        lv_obj_t *reference = makeLine(width, true);
        lv_obj_set_size(reference, 480, 480);
        lv_point_t absolute[3];
        for (int angle = 0; angle < 360; angle += 7) {
            const auto &source = somewhere_artwork::TICKS[angle % somewhere_artwork::TICK_COUNT];
            const roll_compass::InstrumentPoint originals[3] = {
                {source.x1, source.y1}, {source.x2, source.y2}, {240, 240},
            };
            for (int i = 0; i < 3; ++i) {
                points[i] = roll_compass::rotateInstrumentPoint(originals[i], angle);
                absolute[i] = {points[i].x, points[i].y};
            }
            lv_obj_clear_flag(reference, LV_OBJ_FLAG_HIDDEN);
            lv_line_set_points(reference, absolute, 3);
            render();
            memcpy(referencePixels, pixels, sizeof(pixels));
            lv_obj_add_flag(reference, LV_OBJ_FLAG_HIDDEN);
            render();
            line = makeLine(width, true);
            roll_compass::InstrumentLine<3> bounded;
            const roll_compass::InstrumentPoint previous[3] = {{440, 220}, {360, 240}, {250, 260}};
            bounded.update(line, previous, 3);
            render();
            assert(bounded.update(line, points, 3));
            render();
            assert(memcmp(pixels, referencePixels, sizeof(pixels)) == 0);
            lv_obj_del(line);
            render();
        }
        lv_obj_del(reference);
        render();
    }
    printf("156 moving-line raster comparisons passed (LVGL 8.4).\n");
}
