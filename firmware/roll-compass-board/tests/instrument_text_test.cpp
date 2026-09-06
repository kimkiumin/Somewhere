#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <fstream>
#include <string>

#include "instrument_text.h"
#include "univers_font_adapter.h"

LV_FONT_DECLARE(roll_compass_korean_16)
LV_FONT_DECLARE(roll_compass_korean_20)

static bool hasGlyphs(const lv_font_t *font, const char *text) {
    uint32_t offset = 0;
    while (text[offset]) {
        const auto codepoint = _lv_txt_encoded_next(text, &offset);
        lv_font_glyph_dsc_t glyph{};
        if (!lv_font_get_glyph_dsc(font, &glyph, codepoint, 0) || glyph.is_placeholder) {
            return false;
        }
    }
    return true;
}

static roll_compass::InstrumentText fit(const char *text) {
    return roll_compass::fitInstrumentText(text, &somewhere_font_small,
        &roll_compass_korean_16, roll_compass::kInstrumentMenuValueBounds);
}

int main(int argc, char **argv) {
    assert(argc == 2);
    lv_init();
    assert(!hasGlyphs(&somewhere_font_small, "한"));
    assert(hasGlyphs(&somewhere_font_small, "?"));
    const auto source = fit("TONKATSU");
    assert(strcmp(source.text, "TONKATSU") == 0);
    assert(!source.truncated && !source.usedFallback);
    assert(source.font == &somewhere_font_small);
    assert(source.bounds.y == 325 && source.bounds.height == 16);

    // Two long values must not occupy the same pixels. Preserve the source
    // left/right anchors while leaving a visible gap around the centre.
    const auto price = roll_compass::fitInstrumentText("WWWWWWWWWWWW",
        &somewhere_font_small, &roll_compass_korean_16,
        roll_compass::kInstrumentPriceValueBounds);
    const auto menu = fit("WWWWWWWWWWWWWWWW");
    assert(price.bounds.x == 125);
    assert(menu.bounds.x + menu.bounds.width == 355);
    assert(price.bounds.x + price.bounds.width + 8 <= menu.bounds.x);

    for (const auto *text : {"따뜻한 한식", "보통 가격대", "돈까스", "한식 12000"}) {
        const auto result = fit(text);
        assert(strcmp(result.text, text) == 0);
        assert(!result.usedFallback && !result.truncated);
        assert(result.font == &roll_compass_korean_16);
        assert(result.bounds.height >= result.font->line_height);
        assert(roll_compass::rectFitsCircle(result.bounds, 240, 240, 230));
        assert(result.bounds.y >= 321); // no collision with the MENU label
    }
    for (const auto *text : {"WWWWWWWWWWWWWWWW", "따뜻한 한식 따뜻한 한식 따뜻한 한식"}) {
        const auto result = fit(text);
        assert(result.truncated && !result.usedFallback);
        assert(strlen(result.text) >= 3);
        assert(strcmp(result.text + strlen(result.text) - 3, "...") == 0);
        assert(hasGlyphs(result.font, result.text));
        assert(lv_txt_get_width(result.text, strlen(result.text), result.font,
            0, LV_TEXT_FLAG_NONE) <= result.bounds.width);
    }
    for (const auto *text : {"뷁", "🍜", "MENU\nNAME"}) {
        const auto result = fit(text);
        assert(result.usedFallback);
        assert(strcmp(result.text, "ON PHONE") == 0);
        assert(hasGlyphs(result.font, result.text));
        assert(result.font == &somewhere_font_small);
    }
    assert(strcmp(fit(nullptr).text, "--") == 0);
    const auto tiny = roll_compass::fitInstrumentText("WWWWWW", &somewhere_font_small,
        &roll_compass_korean_16, {0, 0, 1, 16});
    assert(tiny.truncated && tiny.text[0] == '\0');

    std::ifstream phrases(argv[1]);
    assert(phrases.good());
    std::string phrase;
    size_t count = 0;
    while (std::getline(phrases, phrase)) {
        if (!phrase.empty() && phrase.back() == '\r') phrase.pop_back();
        if (phrase.empty()) continue;
        assert(hasGlyphs(&roll_compass_korean_16, phrase.c_str()));
        assert(hasGlyphs(&roll_compass_korean_20, phrase.c_str()));
        ++count;
    }
    assert(count > 0);
    printf("Readout fitting/fallback passed; %zu font-text phrases have 16px/20px glyphs.\n", count);
}
