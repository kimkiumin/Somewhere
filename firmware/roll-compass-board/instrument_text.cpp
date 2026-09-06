#include "instrument_text.h"

#include <string.h>
#include "display_content.h"

namespace roll_compass {
namespace {

bool supportsText(const lv_font_t *font, const char *text) {
    uint32_t offset = 0;
    while (text[offset] != '\0') {
        const uint32_t before = offset;
        const uint32_t codepoint = _lv_txt_encoded_next(text, &offset);
        lv_font_glyph_dsc_t glyph{};
        if (offset <= before || codepoint < 0x20 ||
            !lv_font_get_glyph_dsc(font, &glyph, codepoint, 0) || glyph.is_placeholder) {
            return false;
        }
    }
    return true;
}

bool fitsWidth(const char *text, const lv_font_t *font, int16_t width) {
    return lv_txt_get_width(text, strlen(text), font, 0, LV_TEXT_FLAG_NONE) <= width;
}

}  // namespace

InstrumentText fitInstrumentText(
    const char *text, const lv_font_t *asciiFont, const lv_font_t *koreanFont, Rect bounds
) {
    InstrumentText result;
    const char *source = text == nullptr || text[0] == '\0' ? "--" : text;
    result.font = isAsciiDisplayText(source) ? asciiFont : koreanFont;
    if (!supportsText(result.font, source)) {
        source = "ON PHONE";
        result.font = asciiFont;
        result.usedFallback = true;
    }
    // A mixed Korean/ASCII subset can have a taller line box than the source
    // ASCII font. Keep its centre aligned with the original readout bounds.
    result.bounds = bounds;
    if (result.font->line_height > bounds.height) {
        result.bounds.height = result.font->line_height;
        result.bounds.y -= (result.bounds.height - bounds.height) / 2;
    }
    const size_t bytes = strlen(source);
    if (bytes < sizeof(result.text) && fitsWidth(source, result.font, bounds.width)) {
        memcpy(result.text, source, bytes + 1);
        return result;
    }
    result.truncated = true;
    if (!fitsWidth("...", result.font, bounds.width)) return result;
    strcpy(result.text, "...");
    uint32_t offset = 0;
    while (source[offset] != '\0') {
        _lv_txt_encoded_next(source, &offset);
        if (offset + 4 > sizeof(result.text)) break;
        char candidate[sizeof(result.text)] = {};
        memcpy(candidate, source, offset);
        strcpy(candidate + offset, "...");
        if (!fitsWidth(candidate, result.font, bounds.width)) break;
        strcpy(result.text, candidate);
    }
    return result;
}

}  // namespace roll_compass
