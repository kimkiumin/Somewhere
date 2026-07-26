"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const screens = require("./screens.js");

function view(overrides = {}) {
  return {
    phase: "constraints",
    constraints: {
      category: "restaurant",
      maxWalkMinutes: 20,
      budget: null,
      dietary: [],
      accessibility: [],
      disclosure: "standard",
    },
    errors: {},
    distanceM: null,
    bearingDeg: null,
    needleMode: "searching",
    confidence: "unavailable",
    menu: null,
    priceBand: null,
    destination: null,
    revealed: false,
    ...overrides,
  };
}

test("constraints show one start action and collapsed advanced settings", () => {
  const html = screens.renderProductScreen(view());
  assert.match(html, /조건으로 바로 출발/);
  assert.match(html, /<details[^>]*data-advanced-conditions/);
  assert.equal((html.match(/data-action="start"/g) || []).length, 1);
  assert.doesNotMatch(html, /Reroll|다시 추천/);
});

test("constraints and finding do not render a compass", () => {
  assert.doesNotMatch(screens.renderProductScreen(view()), /compass-shell/);
  assert.doesNotMatch(
    screens.renderProductScreen(view({ phase: "finding" })),
    /compass-shell/,
  );
});

test("following and near use a pointing compass and no Reveal control", () => {
  const following = screens.renderProductScreen(view({
    phase: "following", distanceM: 850, bearingDeg: 40,
    needleMode: "pointing", confidence: "ready", menu: "국수", priceBand: "중간",
  }));
  const near = screens.renderProductScreen(view({
    phase: "near", distanceM: 70, bearingDeg: 12,
    needleMode: "pointing", confidence: "ready", menu: "국수", priceBand: "중간",
  }));
  assert.match(following, /class="compass-shell"/);
  assert.match(near, /class="compass-shell"/);
  assert.match(following, /compass-needle is-pointing/);
  assert.match(following, /style="--bearing:40deg"/);
  assert.doesNotMatch(following, /destination-name|목적지 정보 확인/);
  assert.match(following, /data-action="stop"/);
});

test("searching compass never coerces a missing bearing to zero", () => {
  for (const phase of ["following", "route_recovery", "recomputing"]) {
    const html = screens.renderProductScreen(view({
      phase,
      bearingDeg: null,
      needleMode: "searching",
      confidence: phase === "route_recovery" ? "low" : "recomputing",
    }));
    assert.match(html, /compass-needle is-searching/);
    assert.doesNotMatch(html, /--bearing:0deg/);
    assert.match(html, /방향을 확인하고 있어요/);
  }
});

test("paused compass has its own non-rotating needle state", () => {
  const html = screens.renderProductScreen(view({
    phase: "paused", needleMode: "paused", confidence: "paused",
  }));
  assert.match(html, /compass-needle is-paused/);
  assert.doesNotMatch(html, /is-pointing|is-searching|--bearing/);
  assert.match(html, /안내 일시정지/);
});

test("paused and reveal reason screens expose the approved branch controls", () => {
  const paused = screens.renderProductScreen(view({
    phase: "paused", needleMode: "paused", confidence: "paused",
  }));
  const reason = screens.renderProductScreen(view({ phase: "reveal_reason", confidence: "paused" }));
  assert.match(paused, /안내 계속/);
  assert.match(paused, /목적지 정보 확인/);
  assert.match(paused, /안내 종료/);
  assert.match(reason, /건너뛰고 확인/);
  assert.match(reason, /정확한 위치가 공개됩니다/);
  assert.equal((reason.match(/data-action="reveal-destination"/g) || []).length, 7);
});

test("stop confirmation provides a semantic route back to guidance", () => {
  const html = screens.renderProductScreen(view({ phase: "stop_confirm", needleMode: "paused" }));
  assert.match(html, /data-action="continue-guidance"/);
  assert.match(html, /data-action="confirm-end"/);
});

test("route recovery keeps searching copy accurate and preserves the Stop exit", () => {
  const html = screens.renderProductScreen(view({
    phase: "route_recovery", needleMode: "searching", confidence: "low",
  }));
  assert.match(html, /compass-needle is-searching/);
  assert.match(html, /정확한 방향을 확인하고 있어요/);
  assert.doesNotMatch(html, /바늘을 멈췄어요/);
  assert.match(html, /data-action="stop"/);
});

test("external map warning requires explicit confirmation", () => {
  const html = screens.renderProductScreen(view({ phase: "external_map_warning" }));
  assert.match(html, /목적지가 공개될 수 있습니다/);
  assert.match(html, /data-action="cancel-external-map"/);
  assert.match(html, /data-action="confirm-external-map"/);
});

test("arrival renders escaped exact assistance fields and explicit unknowns", () => {
  const html = screens.renderProductScreen(view({
    phase: "arrived",
    revealed: true,
    destination: {
      name: "식당 <script>", address: "서울시 테스트로 1",
      building: "테스트 빌딩", floorUnit: null, entrance: "동쪽 출입구",
    },
  }));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /식당 &lt;script&gt;/);
  assert.match(html, /층 정보 없음/);
  assert.match(html, /동쪽 출입구/);
});

test("pre-Reveal screens cannot emit destination fields even when supplied malformed data", () => {
  const html = screens.renderProductScreen(view({
    phase: "following",
    destination: { name: "비공개 식당", address: "비밀 주소" },
    distanceM: 500,
    bearingDeg: 25,
    needleMode: "pointing",
  }));
  assert.doesNotMatch(html, /비공개 식당|비밀 주소/);
});

test("guidance resumed after Reveal keeps identity disclosed", () => {
  const html = screens.renderProductScreen(view({
    phase: "following_revealed",
    revealed: true,
    distanceM: 500,
    bearingDeg: 25,
    needleMode: "pointing",
    confidence: "ready",
    destination: {
      name: "바람식당", address: "서울시 테스트로 1",
      building: "테스트 빌딩", floorUnit: "2층", entrance: "동쪽 출입구",
    },
  }));
  assert.match(html, /바람식당/);
  assert.match(html, /목적지 공개됨/);
});

test("prototype controls and renderApp remain outside the product renderer", () => {
  const controls = screens.renderPrototypeControls(view());
  assert.match(controls, /<aside/);
  assert.match(controls, /프로토타입 제어 — 실제 앱 UI 아님/);
  for (const simulation of [
    "walk", "near", "arrive", "no-fit", "low-confidence", "restore-confidence",
    "permission-denied", "missing-arrival-field", "feedback-ready", "reset",
  ]) {
    assert.match(controls, new RegExp(`data-simulate="${simulation}"`));
  }

  const root = { innerHTML: "" };
  const controlsRoot = { innerHTML: "" };
  screens.renderApp(root, controlsRoot, view());
  assert.match(root.innerHTML, /product-screen/);
  assert.match(controlsRoot.innerHTML, /prototype-controls/);
});
