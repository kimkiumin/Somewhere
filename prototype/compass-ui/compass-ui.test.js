"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

let compassUi = {};
try {
  compassUi = require("./compass-ui.js");
} catch {
  // The first RED run intentionally exercises the missing implementation.
}

test("formats remaining distance for the compact display", () => {
  assert.equal(compassUi.formatDistance(320), "320 m");
  assert.equal(compassUi.formatDistance(1500), "1.5 km");
  assert.equal(compassUi.formatDistance("not-a-distance"), "—");
});

test("keeps the needle delta on the shortest path", () => {
  assert.equal(compassUi.bearingDelta(5, 355), 10);
  assert.equal(compassUi.bearingDelta(355, 5), -10);
  assert.equal(compassUi.bearingDelta(190, 0), -170);
});

test("formats price values without won symbols and handles no preference", () => {
  assert.equal(compassUi.formatPrice("상관없음"), "-");
  assert.equal(compassUi.formatPrice("10000원"), "10000");
  assert.equal(compassUi.formatPrice("₩10,000"), "10000");
  assert.equal(compassUi.formatPrice("₩₩"), "-");
});

test("builds the three display readouts and relative needle angle", () => {
  assert.deepEqual(
    compassUi.buildCompassViewModel({
      distanceMeters: 820,
      priceBand: "10000원",
      menu: "TONKATSU",
      targetBearingDeg: 25,
      headingDeg: 350,
    }),
    {
      distanceText: "820 m",
      priceText: "10000",
      menuText: "TONKATSU",
      needleAngleDeg: 35,
    },
  );
});

test("uses MENU for the representative dish readout", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "index.html"),
    "utf8",
  );

  assert.match(html, />MENU<\/span>/);
  assert.match(html, /id="menu-readout"/);
  assert.match(html, />TONKATSU<\/strong>/);
  assert.doesNotMatch(html, /돈까스/);
  assert.doesNotMatch(html, />TYPE<\/span>/);
  assert.doesNotMatch(html, />CAFE<\/strong>/);
});

test("uses Thin Condensed globally and reserves the larger size for distance", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "style.css"),
    "utf8",
  );

  assert.match(css, /--font-display:\s*"Univers Next Pro Thin Condensed",/);
  assert.match(css, /--font-ui:\s*"Univers Next Pro Thin Condensed",/);
  assert.match(
    css,
    /\.readout strong\s*\{[\s\S]*?font-size: clamp\(1rem, 3\.3vw, 1\.62rem\);/,
  );
  assert.match(
    css,
    /\.readout-distance strong\s*\{[\s\S]*?font-size: clamp\(1\.8rem, 7vw, 3\.25rem\);/,
  );
});

test("binds the installed Thin Condensed font through a local face declaration", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "style.css"),
    "utf8",
  );

  assert.match(css, /@font-face\s*\{/);
  assert.match(css, /font-family:\s*"Univers Next Pro Thin Condensed"/);
  assert.match(css, /local\("UniversNextPro-ThinCond"\)/);
  assert.match(css, /font-weight:\s*200/);
  assert.match(css, /font-stretch:\s*condensed/);
});

test("applies a CSS rotation to the supplied needle layer", () => {
  const needle = { style: {}, dataset: {} };

  compassUi.applyNeedleRotation(needle, -35);

  assert.equal(needle.style.transform, "rotate(-35deg)");
  assert.equal(needle.dataset.angle, "-35");
});

test("provides a ROM-only display preview without browser controls", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "firmware-preview.html"),
    "utf8",
  );

  assert.match(html, /firmware-preview\.png/);
  assert.match(html, /width="480"/);
  assert.match(html, /height="480"/);
  assert.doesNotMatch(html, /display-controls/);
  assert.doesNotMatch(html, /LIVE VALUES/);

  const previewImage = fs.statSync(path.join(__dirname, "firmware-preview.png"));
  assert.ok(previewImage.size > 0);
});
