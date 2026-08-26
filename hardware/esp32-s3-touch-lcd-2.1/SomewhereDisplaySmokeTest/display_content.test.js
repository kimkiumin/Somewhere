const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildDisplayRows,
  copyDisplayText,
  formatPriceBand,
  formatDistanceMeters,
} = require('./display_content.js');

test('formats distance for the physical display rows', () => {
  assert.equal(formatDistanceMeters(320), '320 m');
  assert.equal(formatDistanceMeters(1500), '1.5 km');
  assert.equal(formatDistanceMeters(10000), '10 km');
  assert.equal(formatDistanceMeters(-1), '--');
});

test('limits menu text without splitting the display buffer contract', () => {
  assert.equal(copyDisplayText('TONKATSU', 11), 'TONKATSU');
  assert.equal(copyDisplayText('A VERY LONG MENU LABEL', 11), 'A VERY LONG');
});

test('formats firmware price values without won markers', () => {
  assert.equal(formatPriceBand('상관없음'), '-');
  assert.equal(formatPriceBand('10000원'), '10000');
  assert.equal(formatPriceBand('10000.5원'), '10000.5');
  assert.equal(formatPriceBand('₩10,000'), '10000');
  assert.equal(formatPriceBand('₩₩'), '-');
});

test('builds the ROM rows without destination identity', () => {
  assert.deepEqual(buildDisplayRows(), {
    distance: '320 m',
    menu: 'TONKATSU',
    price: '-',
  });
});

test('keeps firmware source aligned with the browser display contract', () => {
  const sketch = fs.readFileSync(
    path.join(__dirname, 'SomewhereDisplaySmokeTest.ino'),
    'utf8',
  );

  assert.match(sketch, /#include "univers_next_pro_thin_condensed_font\.h"/);
  assert.match(sketch, /#include "compass_artwork\.h"/);
  assert.match(sketch, /setDisplayState\(/);
  assert.match(sketch, /drawCenteredBitmapText\([^\n]*"REMAINING"/);
  assert.match(sketch, /drawCenteredBitmapText\([^\n]*distance_text[^\n]*UNIVERS_FONT_PIXEL_SIZE_DISTANCE/);
  assert.match(sketch, /drawBitmapText\([^\n]*"PRICE"/);
  assert.match(sketch, /drawBitmapText\([^\n]*price_text[^\n]*UNIVERS_FONT_PIXEL_SIZE_SMALL/);
  assert.match(sketch, /drawRightAlignedBitmapText\([^\n]*"MENU"/);
  assert.match(sketch, /drawRightAlignedBitmapText\([^\n]*menu_text[^\n]*UNIVERS_FONT_PIXEL_SIZE_SMALL/);
  assert.doesNotMatch(sketch, /WALK \/ CAFE/);
  assert.doesNotMatch(sketch, /PRICE: \$\$/);
  assert.doesNotMatch(sketch, /const Glyph FONT\[\]/);
});

test('checks in generated Thin Condensed glyph data instead of a runtime TTF dependency', () => {
  const fontHeader = fs.readFileSync(
    path.join(__dirname, 'univers_next_pro_thin_condensed_font.h'),
    'utf8',
  );

  assert.match(fontHeader, /Univers Next Pro Thin Condensed/);
  assert.match(fontHeader, /UNIVERS_FONT_PIXEL_SIZE_DISTANCE\s*=\s*34/);
  assert.match(fontHeader, /UNIVERS_FONT_PIXEL_SIZE_SMALL\s*=\s*16/);
  assert.match(fontHeader, /UNIVERS_FONT_PIXEL_SIZE_LABEL\s*=\s*8/);
  assert.match(fontHeader, /0x54/); // T
  assert.match(fontHeader, /0x30/); // 0
  assert.match(fontHeader, /0x3F/); // ? fallback
  assert.match(fontHeader, /FONT_SOURCE_SHA256\[\] = "[0-9a-f]{64}"/);
  assert.doesNotMatch(fontHeader, /\.ttf/i);
});

test('checks in the SVG tick geometry used by the ROM renderer', () => {
  const artworkHeader = fs.readFileSync(
    path.join(__dirname, 'compass_artwork.h'),
    'utf8',
  );

  assert.match(artworkHeader, /SVG_SOURCE_SHA256\[\] = "[0-9a-f]{64}"/);
  assert.match(artworkHeader, /static constexpr size_t TICK_COUNT/);
  assert.equal((artworkHeader.match(/^  \{-?\d+, -?\d+, -?\d+, -?\d+\},$/gm) || []).length, 80);
});

test('renders into one completed buffer before presenting the next frame', () => {
  const sketch = fs.readFileSync(
    path.join(__dirname, 'SomewhereDisplaySmokeTest.ino'),
    'utf8',
  );

  assert.match(sketch, /uint16_t \*render_buffer/);
  assert.match(sketch, /render_buffer\[offset\] = color/);
  assert.doesNotMatch(sketch, /frame_buffer_b\[offset\] = color/);
  assert.match(sketch, /esp_lcd_panel_draw_bitmap\(\s*panel_handle/);
  assert.match(sketch, /on_frame_buf_complete/);
});
