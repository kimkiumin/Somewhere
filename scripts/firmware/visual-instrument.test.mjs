import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const firmwareRoot = resolve(repositoryRoot, "firmware/roll-compass-board");

function readFirmwareFile(name) {
  return readFileSync(resolve(firmwareRoot, name), "utf8");
}

test("ports the collaborator's exact artwork and font metadata", () => {
  expect(existsSync(resolve(firmwareRoot, "compass_artwork.h"))).toBe(true);
  expect(existsSync(resolve(firmwareRoot, "univers_next_pro_thin_condensed_font.h"))).toBe(true);

  const artwork = readFirmwareFile("compass_artwork.h");
  expect(artwork).toContain(
    'SVG_SOURCE_SHA256[] = "d9e96a7671986c2a5cdb05529c9b0cfac6ed234c4b42840efd0a4771cc11722e"',
  );
  expect(artwork).toContain("SCREEN_SIZE = 480");
  expect(artwork).toContain("TICK_COUNT");

  const font = readFirmwareFile("univers_next_pro_thin_condensed_font.h");
  expect(font).toContain('FONT_FAMILY[] = "Univers Next Pro Thin Condensed"');
  expect(font).toContain(
    'FONT_SOURCE_SHA256[] = "1ab10cd426863916f7bd5d7da46e5444d37c360188b53595117581d765cd5cf7"',
  );
});

test("uses the circular instrument palette and three source readouts", () => {
  const renderer = readFirmwareFile("display_ui.cpp");
  expect(renderer).toContain("0x050706");
  expect(renderer).toContain("0xE4ECE8");
  expect(renderer).toContain("0x4DFF76");
  expect(renderer).toContain("0xFF3850");
  expect(renderer).toContain('"REMAINING"');
  expect(renderer).toContain('"PRICE"');
  expect(renderer).toContain('"MENU"');
  expect(renderer).toContain("somewhere_artwork::TICKS");
  expect(renderer).not.toContain("rollCompassShellImage");
  expect(renderer).not.toContain("0xF8F3E8");
});

test("matches the source needle and readout hierarchy without extra demo chrome", () => {
  const renderer = readFirmwareFile("display_ui.cpp");
  const layout = readFirmwareFile("compass_layout.h");
  const needleStyles = readFirmwareFile("needle_styles.cpp");
  const diagnostics = readFirmwareFile("compass_diagnostics.cpp");
  expect(renderer).not.toContain("mountRotationDegrees");
  expect(renderer).not.toContain("displayTapped");
  expect(renderer).not.toContain("lv_obj_add_event_cb(screen");
  expect(renderer).not.toContain("needleHub");
  expect(needleStyles).toContain("kInstrumentNeedleStrokeWidth");
  expect(layout).toContain("kInstrumentNeedleStrokeWidth = 2");
  expect(renderer).toContain("kReadoutLabelOpacity = 168");
  expect(renderer).toContain(
    "kReadoutValueOpacity = LV_OPA_COVER",
  );
  expect(renderer).toContain(
    "lv_obj_set_style_text_opa(distanceValue, kReadoutValueOpacity",
  );
  expect(renderer).toContain(
    "lv_obj_set_style_text_opa(priceValue, kReadoutValueOpacity",
  );
  expect(renderer).toContain(
    "lv_obj_set_style_text_opa(menuValue, kReadoutValueOpacity",
  );
  expect(renderer).toContain("nextNeedleStyle(activeNeedleStyle)");
  expect(renderer).toContain("needleStyleClicked");
  expect(renderer).toContain("needleSpring.reset(35.0f)");
  expect(diagnostics).toContain("visualDemo_ ? 0 : actionMaskForPhase(phase_)");
});

test("keeps v2 projected fields flowing into the board render model", () => {
  const runtime = readFirmwareFile("compass_runtime.h");
  const sketch = readFirmwareFile("roll-compass-board.ino");
  expect(runtime).toContain("char menu[");
  expect(runtime).toContain("char priceBand[");
  expect(sketch).toContain("input.menu");
  expect(sketch).toContain("input.priceBand");
});

test("documents a Korean display fallback instead of changing the v2 wire contract", () => {
  const renderer = readFirmwareFile("display_ui.cpp");
  const handoff = readFileSync(
    resolve(repositoryRoot, "docs/operations/windows-collaboration-handoff.md"),
    "utf8",
  );
  expect(renderer).toContain("isAsciiDisplayText");
  expect(renderer).toContain("roll_compass_korean_16");
  expect(handoff).toContain("ASCII");
  expect(handoff).toContain("Korean");
});
