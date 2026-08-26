#include <Arduino.h>
#include <Wire.h>
#include <math.h>
#include <string.h>

#include "Display_ST7701.h"
#include "Touch_CST820.h"
#include "TCA9554PWR.h"
#include "display_content.h"
#include "univers_next_pro_thin_condensed_font.h"
#include "compass_artwork.h"

namespace {

constexpr int SCREEN_WIDTH = 480;
constexpr int SCREEN_HEIGHT = 480;
constexpr float RADIANS_PER_DEGREE = 0.01745329252f;

constexpr uint16_t rgb565(uint8_t red, uint8_t green, uint8_t blue) {
  return static_cast<uint16_t>(((red & 0xF8) << 8) | ((green & 0xFC) << 3) | (blue >> 3));
}

constexpr uint16_t COLOR_BACKGROUND = rgb565(5, 7, 6);
constexpr uint16_t COLOR_INK = rgb565(232, 236, 232);
constexpr uint16_t COLOR_GREEN = rgb565(77, 255, 118);
constexpr uint16_t COLOR_PINK = rgb565(255, 56, 80);
constexpr uint16_t COLOR_TEST_RED = rgb565(220, 58, 67);
constexpr uint16_t COLOR_TEST_GREEN = rgb565(60, 177, 115);
constexpr uint16_t COLOR_TEST_BLUE = rgb565(47, 112, 202);
constexpr uint8_t COLOR_MUTED_ALPHA = 168;
constexpr int COMPASS_CENTER_X = 240;
constexpr int COMPASS_CENTER_Y = 240;
constexpr int NEEDLE_LENGTH = 139;
constexpr int NEEDLE_STROKE = 2;

struct DisplayState {
  int32_t distance_meters;
  char price[32];
  char menu[32];
  float target_bearing_deg;
  float heading_deg;
  bool direction_valid;
};

DisplayState display_state = {
  320,
  "-",
  "TONKATSU",
  35.0f,
  0.0f,
  true,
};

uint16_t *frame_buffer_a = nullptr;
uint16_t *frame_buffer_b = nullptr;
uint16_t *render_buffer = nullptr;
TaskHandle_t render_task_handle = nullptr;
uint8_t displayed_buffer_index = 0;
uint32_t last_draw_ms = 0;
uint32_t last_touch_ms = 0;
uint32_t touch_count = 0;

bool IRAM_ATTR onFrameBufferComplete(
    esp_lcd_panel_handle_t,
    const esp_lcd_rgb_panel_event_data_t *,
    void *) {
  BaseType_t high_task_awoken = pdFALSE;
  if (render_task_handle != nullptr) {
    vTaskNotifyGiveFromISR(render_task_handle, &high_task_awoken);
  }
  return high_task_awoken == pdTRUE;
}

bool registerFrameBufferCallbacks() {
  esp_lcd_rgb_panel_event_callbacks_t callbacks = {};
  callbacks.on_frame_buf_complete = onFrameBufferComplete;
  return esp_lcd_rgb_panel_register_event_callbacks(panel_handle, &callbacks, nullptr) == ESP_OK;
}

uint16_t *frameBufferForIndex(uint8_t index) {
  return index == 0 ? frame_buffer_a : frame_buffer_b;
}

bool presentFrame(uint8_t index) {
  ulTaskNotifyTake(pdTRUE, 0);

  const esp_err_t result = esp_lcd_panel_draw_bitmap(
      panel_handle,
      0,
      0,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      frameBufferForIndex(index));
  if (result != ESP_OK) {
    Serial.printf("[ERROR] frame buffer switch failed: %s\\n", esp_err_to_name(result));
    return false;
  }

  if (ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(100)) == 0) {
    Serial.println("[ERROR] frame buffer switch timed out");
    return false;
  }

  displayed_buffer_index = index;
  return true;
}

void setPixel(int x, int y, uint16_t color) {
  if (x < 0 || x >= SCREEN_WIDTH || y < 0 || y >= SCREEN_HEIGHT) {
    return;
  }

  const size_t offset = static_cast<size_t>(y) * SCREEN_WIDTH + x;
  render_buffer[offset] = color;
}

void fillScreen(uint16_t color) {
  const size_t pixel_count = static_cast<size_t>(SCREEN_WIDTH) * SCREEN_HEIGHT;
  for (size_t index = 0; index < pixel_count; ++index) {
    render_buffer[index] = color;
  }
}

void fillRect(int x, int y, int width, int height, uint16_t color) {
  if (width <= 0 || height <= 0) {
    return;
  }

  const int left = max(0, x);
  const int top = max(0, y);
  const int right = min(SCREEN_WIDTH, x + width);
  const int bottom = min(SCREEN_HEIGHT, y + height);

  for (int row = top; row < bottom; ++row) {
    for (int column = left; column < right; ++column) {
      setPixel(column, row, color);
    }
  }
}

void drawLine(int x0, int y0, int x1, int y1, uint16_t color) {
  const int dx = abs(x1 - x0);
  const int sx = x0 < x1 ? 1 : -1;
  const int dy = -abs(y1 - y0);
  const int sy = y0 < y1 ? 1 : -1;
  int error = dx + dy;

  while (true) {
    setPixel(x0, y0, color);
    if (x0 == x1 && y0 == y1) {
      return;
    }

    const int doubled_error = 2 * error;
    if (doubled_error >= dy) {
      error += dy;
      x0 += sx;
    }
    if (doubled_error <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

uint16_t blendRgb565(uint16_t background, uint16_t foreground, uint8_t alpha) {
  const uint8_t background_red = static_cast<uint8_t>(((background >> 11) & 0x1F) * 255 / 31);
  const uint8_t background_green = static_cast<uint8_t>(((background >> 5) & 0x3F) * 255 / 63);
  const uint8_t background_blue = static_cast<uint8_t>((background & 0x1F) * 255 / 31);
  const uint8_t foreground_red = static_cast<uint8_t>(((foreground >> 11) & 0x1F) * 255 / 31);
  const uint8_t foreground_green = static_cast<uint8_t>(((foreground >> 5) & 0x3F) * 255 / 63);
  const uint8_t foreground_blue = static_cast<uint8_t>((foreground & 0x1F) * 255 / 31);
  const uint8_t inverse_alpha = static_cast<uint8_t>(255 - alpha);
  const uint8_t red = static_cast<uint8_t>((foreground_red * alpha + background_red * inverse_alpha + 127) / 255);
  const uint8_t green = static_cast<uint8_t>((foreground_green * alpha + background_green * inverse_alpha + 127) / 255);
  const uint8_t blue = static_cast<uint8_t>((foreground_blue * alpha + background_blue * inverse_alpha + 127) / 255);
  return static_cast<uint16_t>(((red & 0xF8) << 8) | ((green & 0xFC) << 3) | (blue >> 3));
}

uint32_t normalizeGlyphCodepoint(char character) {
  const uint8_t byte = static_cast<uint8_t>(character);
  if (byte >= 'A' && byte <= 'Z') {
    return byte;
  }
  if (byte >= 'a' && byte <= 'z') {
    return byte;
  }
  if (byte >= 0x20 && byte <= 0x7E) {
    return byte;
  }
  return static_cast<uint32_t>('?');
}

int bitmapTextWidth(const char *text, uint16_t pixel_size) {
  if (text == nullptr) {
    return 0;
  }

  int width = 0;
  for (size_t index = 0; text[index] != '\0'; ++index) {
    const somewhere_font::BitmapGlyph *glyph = somewhere_font::findGlyph(
        pixel_size, normalizeGlyphCodepoint(text[index]));
    width += glyph->advance;
  }
  return width;
}

void drawBitmapText(int x, int baseline_y, const char *text, uint16_t pixel_size,
                    uint16_t color, uint8_t opacity = 255) {
  if (text == nullptr || pixel_size == 0) {
    return;
  }

  int cursor_x = x;
  for (size_t index = 0; text[index] != '\0'; ++index) {
    const somewhere_font::BitmapGlyph *glyph = somewhere_font::findGlyph(
        pixel_size, normalizeGlyphCodepoint(text[index]));
    for (uint16_t row = 0; row < glyph->height; ++row) {
      for (uint16_t column = 0; column < glyph->width; ++column) {
        const uint32_t bitmap_index = glyph->bitmap_offset + row * glyph->width + column;
        const uint8_t glyph_alpha = somewhere_font::BITMAP[bitmap_index];
        if (glyph_alpha == 0) {
          continue;
        }
        const uint8_t alpha = static_cast<uint8_t>(glyph_alpha * opacity / 255);
        const int pixel_x = cursor_x + glyph->bearing_x + column;
        const int pixel_y = baseline_y + glyph->bearing_y + row;
        if (pixel_x < 0 || pixel_x >= SCREEN_WIDTH || pixel_y < 0 || pixel_y >= SCREEN_HEIGHT) {
          continue;
        }
        const size_t offset = static_cast<size_t>(pixel_y) * SCREEN_WIDTH + pixel_x;
        setPixel(pixel_x, pixel_y, blendRgb565(render_buffer[offset], color, alpha));
      }
    }
    cursor_x += glyph->advance;
  }
}

void drawCenteredBitmapText(int center_x, int baseline_y, const char *text,
                            uint16_t pixel_size, uint16_t color,
                            uint8_t opacity = 255) {
  drawBitmapText(center_x - bitmapTextWidth(text, pixel_size) / 2, baseline_y,
                 text, pixel_size, color, opacity);
}

void drawRightAlignedBitmapText(int right_x, int baseline_y, const char *text,
                                uint16_t pixel_size, uint16_t color,
                                uint8_t opacity = 255) {
  drawBitmapText(right_x - bitmapTextWidth(text, pixel_size), baseline_y, text,
                 pixel_size, color, opacity);
}

void drawColorTest() {
  fillRect(0, 0, 160, SCREEN_HEIGHT, COLOR_TEST_RED);
  fillRect(160, 0, 160, SCREEN_HEIGHT, COLOR_TEST_GREEN);
  fillRect(320, 0, 160, SCREEN_HEIGHT, COLOR_TEST_BLUE);
  drawCenteredBitmapText(240, 242, "DISPLAY OK", somewhere_font::UNIVERS_FONT_PIXEL_SIZE_DIRECTION, rgb565(255, 255, 255));
  drawCenteredBitmapText(240, 275, "ROM TEST", somewhere_font::UNIVERS_FONT_PIXEL_SIZE_SMALL, rgb565(255, 255, 255));
}

float normalizeDegrees(float degrees) {
  if (!isfinite(degrees)) {
    return 0.0f;
  }

  float normalized = fmodf(degrees, 360.0f);
  if (normalized < 0.0f) {
    normalized += 360.0f;
  }
  return normalized;
}

float bearingDelta(float target_degrees, float heading_degrees) {
  const float target = normalizeDegrees(target_degrees);
  const float heading = normalizeDegrees(heading_degrees);
  float delta = target - heading;
  if (delta > 180.0f) {
    delta -= 360.0f;
  }
  if (delta < -180.0f) {
    delta += 360.0f;
  }
  return delta;
}

void drawCompassFace() {
  const uint16_t tick_color = rgb565(228, 236, 232);
  for (size_t index = 0; index < somewhere_artwork::TICK_COUNT; ++index) {
    const somewhere_artwork::CompassTick &tick = somewhere_artwork::TICKS[index];
    drawLine(tick.x1, tick.y1, tick.x2, tick.y2, tick_color);
  }

  drawCenteredBitmapText(COMPASS_CENTER_X, 80, "N", somewhere_font::UNIVERS_FONT_PIXEL_SIZE_DIRECTION, COLOR_INK);
  drawCenteredBitmapText(COMPASS_CENTER_X, 407, "S", somewhere_font::UNIVERS_FONT_PIXEL_SIZE_DIRECTION, COLOR_INK);
  drawCenteredBitmapText(414, 246, "E", somewhere_font::UNIVERS_FONT_PIXEL_SIZE_DIRECTION, COLOR_INK);
  drawCenteredBitmapText(66, 246, "W", somewhere_font::UNIVERS_FONT_PIXEL_SIZE_DIRECTION, COLOR_INK);
}

void drawNeedle(float degrees) {
  const float radians = degrees * RADIANS_PER_DEGREE;
  const float direction_x = sinf(radians);
  const float direction_y = -cosf(radians);
  const float perpendicular_x = -direction_y;
  const float perpendicular_y = direction_x;
  const int tip_x = COMPASS_CENTER_X + static_cast<int>(direction_x * NEEDLE_LENGTH);
  const int tip_y = COMPASS_CENTER_Y + static_cast<int>(direction_y * NEEDLE_LENGTH);

  for (int offset = 0; offset < NEEDLE_STROKE; ++offset) {
    const int x_offset = static_cast<int>(perpendicular_x * offset);
    const int y_offset = static_cast<int>(perpendicular_y * offset);
    drawLine(COMPASS_CENTER_X + x_offset, COMPASS_CENTER_Y + y_offset,
             tip_x + x_offset, tip_y + y_offset, COLOR_PINK);
  }
}

void drawScene(uint32_t now) {
  fillScreen(COLOR_BACKGROUND);

  char distance_text[32] = {};
  char menu_text[32] = {};
  char price_text[32] = {};
  formatDistanceMeters(display_state.distance_meters, distance_text, sizeof(distance_text));
  copyDisplayText(menu_text, sizeof(menu_text), display_state.menu);
  formatPriceBand(display_state.price, price_text, sizeof(price_text));

  drawCompassFace();
  const float needle_degrees = display_state.direction_valid
      ? bearingDelta(display_state.target_bearing_deg, display_state.heading_deg)
      : fmodf(now * 0.035f, 360.0f);
  drawNeedle(needle_degrees);

  drawCenteredBitmapText(COMPASS_CENTER_X, 119, "REMAINING", somewhere_font::UNIVERS_FONT_PIXEL_SIZE_LABEL, COLOR_GREEN, COLOR_MUTED_ALPHA);
  drawCenteredBitmapText(COMPASS_CENTER_X, 153, distance_text, somewhere_font::UNIVERS_FONT_PIXEL_SIZE_DISTANCE, COLOR_GREEN);

  drawBitmapText(125, 319, "PRICE", somewhere_font::UNIVERS_FONT_PIXEL_SIZE_LABEL, COLOR_GREEN, COLOR_MUTED_ALPHA);
  drawBitmapText(125, 337, price_text, somewhere_font::UNIVERS_FONT_PIXEL_SIZE_SMALL, COLOR_GREEN);
  drawRightAlignedBitmapText(355, 319, "MENU", somewhere_font::UNIVERS_FONT_PIXEL_SIZE_LABEL, COLOR_GREEN, COLOR_MUTED_ALPHA);
  drawRightAlignedBitmapText(355, 337, menu_text, somewhere_font::UNIVERS_FONT_PIXEL_SIZE_SMALL, COLOR_GREEN);
}

void handleTouch(uint32_t now) {
  Touch_Read_Data();
  if (touch_data.points == 0 || now - last_touch_ms < 350) {
    return;
  }

  ++touch_count;
  last_touch_ms = now;
  Serial.printf("[TOUCH] count=%lu x=%u y=%u\n", static_cast<unsigned long>(touch_count), touch_data.x, touch_data.y);
  touch_data.points = 0;
}

}  // namespace

void setDisplayState(int32_t distance_meters, const char *price_band,
                     const char *menu, float target_bearing_deg,
                     float heading_deg, bool direction_valid) {
  display_state.distance_meters = distance_meters;
  formatPriceBand(price_band, display_state.price, sizeof(display_state.price));
  copyDisplayText(display_state.menu, sizeof(display_state.menu), menu);
  display_state.target_bearing_deg = target_bearing_deg;
  display_state.heading_deg = heading_deg;
  display_state.direction_valid = direction_valid;
}

void setup() {
  Serial.begin(115200);
  delay(700);
  Serial.println();
  Serial.println("[SOMEWHERE] ESP32-S3 Touch LCD 2.1 smoke test");
  Serial.printf("[INFO] chip=%s flash=%lu bytes psram=%s psram_size=%lu bytes\n",
                ESP.getChipModel(), static_cast<unsigned long>(ESP.getFlashChipSize()),
                psramFound() ? "yes" : "no", static_cast<unsigned long>(ESP.getPsramSize()));

  I2C_Init();
  delay(50);
  TCA9554PWR_Init(0x00);
  Set_EXIO(EXIO_PIN8, Low);
  delay(20);

  LCD_Init();
  Set_Backlight(80);
  frame_buffer_a = static_cast<uint16_t *>(LCD_GetFrameBuffer(0));
  frame_buffer_b = static_cast<uint16_t *>(LCD_GetFrameBuffer(1));

  if (frame_buffer_a == nullptr || frame_buffer_b == nullptr) {
    Serial.println("[ERROR] RGB framebuffer allocation failed");
    while (true) {
      delay(1000);
    }
  }

  render_task_handle = xTaskGetCurrentTaskHandle();
  if (!registerFrameBufferCallbacks()) {
    Serial.println("[ERROR] RGB framebuffer callbacks could not be registered");
    while (true) {
      delay(1000);
    }
  }

  render_buffer = frame_buffer_a;
  drawColorTest();
  delay(1000);

  render_buffer = frame_buffer_b;
  drawScene(millis());
  if (!presentFrame(1)) {
    while (true) {
      delay(1000);
    }
  }
  render_buffer = frame_buffer_a;
  Serial.println("[READY] display + backlight + touch driver initialized");
  Serial.println("[READY] display rows: REMAINING / PRICE / MENU");
}

void loop() {
  const uint32_t now = millis();
  handleTouch(now);

  if (now - last_draw_ms >= 80) {
    const uint8_t next_buffer_index = displayed_buffer_index == 0 ? 1 : 0;
    render_buffer = frameBufferForIndex(next_buffer_index);
    drawScene(now);
    if (!presentFrame(next_buffer_index)) {
      while (true) {
        delay(1000);
      }
    }
    render_buffer = frameBufferForIndex(displayed_buffer_index == 0 ? 1 : 0);
    last_draw_ms = now;
  }

  delay(8);
}
