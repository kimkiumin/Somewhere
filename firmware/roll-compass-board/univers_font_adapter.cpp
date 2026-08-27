#include "univers_font_adapter.h"

#include "univers_next_pro_thin_condensed_font.h"

namespace {

struct FontConfig {
    uint16_t pixelSize;
    lv_coord_t lineHeight;
};

const FontConfig kLabelConfig{somewhere_font::UNIVERS_FONT_PIXEL_SIZE_LABEL, 8};
const FontConfig kSmallConfig{somewhere_font::UNIVERS_FONT_PIXEL_SIZE_SMALL, 12};
const FontConfig kDirectionConfig{somewhere_font::UNIVERS_FONT_PIXEL_SIZE_DIRECTION, 25};
const FontConfig kDistanceConfig{somewhere_font::UNIVERS_FONT_PIXEL_SIZE_DISTANCE, 31};

const somewhere_font::BitmapGlyph *glyphFor(
    const lv_font_t *font,
    uint32_t codepoint
) {
    const FontConfig *config = static_cast<const FontConfig *>(font->dsc);
    return somewhere_font::findGlyph(config->pixelSize, codepoint);
}

bool getGlyphDsc(
    const lv_font_t *font,
    lv_font_glyph_dsc_t *descriptor,
    uint32_t letter,
    uint32_t
) {
    if (descriptor == nullptr) return false;
    const somewhere_font::BitmapGlyph *glyph = glyphFor(font, letter);
    descriptor->resolved_font = font;
    descriptor->adv_w = glyph->advance;
    descriptor->box_w = glyph->width;
    descriptor->box_h = glyph->height;
    descriptor->ofs_x = glyph->bearing_x;
    // The source renderer supplies a baseline and stores the glyph's top as a
    // negative bearing. LVGL positions glyphs from the bottom of its line box,
    // so a zero offset preserves the same baseline geometry.
    descriptor->ofs_y = 0;
    descriptor->bpp = 8;
    descriptor->is_placeholder = false;
    return true;
}

const uint8_t *getGlyphBitmap(const lv_font_t *font, uint32_t letter) {
    const somewhere_font::BitmapGlyph *glyph = glyphFor(font, letter);
    return &somewhere_font::BITMAP[glyph->bitmap_offset];
}

}  // namespace

const lv_font_t somewhere_font_label = {
    getGlyphDsc,
    getGlyphBitmap,
    kLabelConfig.lineHeight,
    0,
    LV_FONT_SUBPX_NONE,
    0,
    0,
    &kLabelConfig,
    nullptr,
    nullptr,
};

const lv_font_t somewhere_font_small = {
    getGlyphDsc,
    getGlyphBitmap,
    kSmallConfig.lineHeight,
    0,
    LV_FONT_SUBPX_NONE,
    0,
    0,
    &kSmallConfig,
    nullptr,
    nullptr,
};

const lv_font_t somewhere_font_direction = {
    getGlyphDsc,
    getGlyphBitmap,
    kDirectionConfig.lineHeight,
    0,
    LV_FONT_SUBPX_NONE,
    0,
    0,
    &kDirectionConfig,
    nullptr,
    nullptr,
};

const lv_font_t somewhere_font_distance = {
    getGlyphDsc,
    getGlyphBitmap,
    kDistanceConfig.lineHeight,
    0,
    LV_FONT_SUBPX_NONE,
    0,
    0,
    &kDistanceConfig,
    nullptr,
    nullptr,
};
