"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const screens = require("./screens.js");

function view(overrides = {}) {
  return {
    phase: "constraints",
    constraints: {
      category: "restaurant",
      partySize: 2,
      maxWalkMinutes: 20,
      budget: null,
      dietary: [],
      allergies: [],
      accessibility: [],
      disclosure: "standard",
    },
    errors: {},
    affectedConditions: [],
    distanceM: null,
    bearingDeg: null,
    needleMode: "searching",
    confidence: "unavailable",
    menu: null,
    priceBand: null,
    destination: null,
    revealed: false,
    profileMenuOpen: false,
    ...overrides,
  };
}

test("constraints show one start action and collapsed advanced settings", () => {
  const html = screens.renderProductScreen(view());
  assert.match(html, />이 조건으로 바로 출발<\/button>/);
  assert.match(html, /<details[^>]*data-advanced-conditions/);
  assert.doesNotMatch(html, /<details[^>]*data-advanced-conditions[^>]*\sopen(?:\s|>)/);
  assert.equal((html.match(/data-action="start"/g) || []).length, 1);
  assert.doesNotMatch(html, /Reroll|다시 추천/);
});

test("constraints fix the category to restaurant and expose time and budget sliders", () => {
  const html = screens.renderProductScreen(view());
  assert.doesNotMatch(html, /어디로 갈까요|value="cafe"|카페/);
  assert.match(html, /name="maxWalkMinutes"[^>]*type="range"/);
  assert.match(html, /min="5"[^>]*max="60"[^>]*step="5"/);
  assert.match(html, /name="budget"[^>]*type="range"/);
  assert.match(html, /data-budget-unlimited/);
  assert.match(html, /상관없음/);
  const withBudget = screens.renderProductScreen(view({
    constraints: { ...view().constraints, budget: 4_000 },
  }));
  assert.match(withBudget, /4,000원 이하/);
});

test("constraints render the party selector before walking time", () => {
  const html = screens.renderProductScreen(view({
    constraints: { ...view().constraints, partySize: 3 },
  }));
  assert.ok(html.indexOf("함께 가는 인원") < html.indexOf("도보 시간"));
  assert.match(html, /data-action="party-decrement"/);
  assert.match(html, /data-action="party-increment"/);
  assert.match(html, /aria-live="polite"[^>]*>3명/);
  assert.equal((html.match(/data-party-pawn/g) || []).length, 3);
});

test("five or more renders five pawns and disables the increment control", () => {
  const html = screens.renderProductScreen(view({
    constraints: { ...view().constraints, partySize: 5 },
  }));
  assert.match(html, /5명 이상/);
  assert.equal((html.match(/data-party-pawn/g) || []).length, 5);
  assert.match(html, /data-action="party-increment"[^>]*disabled/);
});

test("profile edit is removed from constraints and exposed through the profile menu", () => {
  const closed = screens.renderProductScreen(view({ profileMenuOpen: false }));
  assert.doesNotMatch(closed, /프로필 수정/);
  assert.match(closed, /data-action="open-profile-menu"/);
  const open = screens.renderProductScreen(view({ profileMenuOpen: true }));
  assert.match(open, /환경설정/);
  assert.match(open, /로그아웃/);
});

test("budget slider uses dense low stops, coarse high stops, and a final unlimited stop", () => {
  assert.deepEqual(screens.BUDGET_STOPS, [
    4_000, 6_000, 8_000, 10_000, 12_000, 14_000, 16_000, 18_000, 20_000,
    30_000, 40_000, 50_000, null,
  ]);
  const low = screens.renderProductScreen(view());
  assert.match(low, /min="0"[^>]*max="12"[^>]*value="12"/);
  assert.doesNotMatch(low, /2,000원 이하/);
  const high = screens.renderProductScreen(view({
    constraints: { ...view().constraints, budget: 30_000 },
  }));
  assert.match(high, /name="budget"[^>]*min="0"[^>]*max="12"[^>]*step="1"/);
  assert.match(high, /value="9"/);
  assert.match(high, /30,000원 이하/);
});

test("minimal disclosure is the default and private is the optional choice", () => {
  const html = screens.renderProductScreen(view({
    constraints: { ...view().constraints, disclosure: "minimal" },
  }));
  assert.match(html, /최소 정보 공개/);
  assert.match(html, /비공개/);
  assert.match(html, /option value="minimal" selected/);
  assert.doesNotMatch(html, /기본 비공개/);
});

test("profile screens expose searchable multi-select diet and allergy pickers", () => {
  for (const phase of ["profile_setup", "profile"]) {
    const html = screens.renderProductScreen(view({ phase, profile: {
      dietary: ["vegetarian"], allergies: ["peanut"],
    } }));
    assert.match(html, /식이 조건/);
    assert.match(html, /알레르기/);
    assert.match(html, /data-picker-search="dietary"/);
    assert.match(html, /data-picker-search="allergies"/);
    assert.match(html, /type="checkbox"[^>]*name="dietary"/);
    assert.match(html, /type="checkbox"[^>]*name="allergies"/);
    assert.match(html, /검색해서 선택할 수 있어요/);
  }
});

test("profile pickers use specific dietary taxonomy and the Korean 19-allergen set", () => {
  const html = screens.renderProductScreen(view({ phase: "profile" }));
  for (const label of [
    "비건", "락토", "오보", "락토-오보", "페스코", "폴로-페스코", "플렉시테리언", "할랄", "코셔", "저염",
  ]) {
    assert.match(html, new RegExp(label), label);
  }
  for (const label of [
    "난류", "우유", "메밀", "땅콩", "대두", "밀", "고등어", "게", "새우", "돼지고기",
    "복숭아", "토마토", "아황산류", "호두", "닭고기", "쇠고기", "오징어", "조개류", "잣",
  ]) {
    assert.match(html, new RegExp(label), label);
  }
  assert.equal((html.match(/class="profile-choice-input"/g) || []).length, 31);
  assert.match(html, /조개류\(굴·전복·홍합 포함\)/);
  assert.doesNotMatch(html, /tree_nut|견과류/);
});

test("profile checkbox rows carry a compact layout hook instead of the generic full-width input rule", () => {
  const html = screens.renderProductScreen(view({ phase: "profile" }));
  assert.match(html, /class="picker-option"/);
  assert.match(html, /class="profile-choice-input"/);
  assert.match(html, /class="picker-option-text"/);
});

test("dietary and allergy lists expose four-item scroll containers", () => {
  const html = screens.renderProductScreen(view({ phase: "profile" }));
  assert.equal((html.match(/class="picker-options picker-options-scroll"/g) || []).length, 2);
  assert.equal((html.match(/data-visible-items="4"/g) || []).length, 2);
  assert.match(html, /식이 조건 선택 목록\. 네 항목씩 보입니다\./);
  assert.match(html, /알레르기 선택 목록\. 네 항목씩 보입니다\./);
});

test("each profile list starts with an explicit no-condition option", () => {
  const html = screens.renderProductScreen(view({ phase: "profile" }));
  assert.equal((html.match(/data-profile-none/g) || []).length, 2);
  assert.equal((html.match(/value="none"[^>]* checked/g) || []).length, 2);
  assert.ok(html.indexOf("data-profile-none=\"dietary\"") < html.indexOf("value=\"vegan\""));
  assert.ok(html.indexOf("data-profile-none=\"allergies\"") < html.indexOf("value=\"egg\""));
});

test("private disclosure hides guidance detail rows", () => {
  const html = screens.renderProductScreen(view({
    phase: "following", distanceM: 850, bearingDeg: 40,
    needleMode: "pointing", confidence: "ready", menu: "국수", priceBand: "중간",
    constraints: { ...view().constraints, disclosure: "private" },
  }));
  assert.match(html, /정보 비공개 상태로 안내 중이에요/);
  assert.doesNotMatch(html, /<dt>남은 거리<\/dt>|<dt>대표 메뉴<\/dt>|<dt>가격대<\/dt>/);
});

test("onboarding explicitly says the destination stays hidden", () => {
  const html = screens.renderProductScreen(view({ phase: "onboarding" }));
  assert.match(html, /목적지는 도착하거나 직접 확인할 때까지 숨겨져 있어요/);
});

test("collapsed advanced conditions summarize every active type and preserve disclosure", () => {
  const html = screens.renderProductScreen(view({
    constraints: {
      category: "restaurant",
      maxWalkMinutes: 20,
      budget: "20,000원 이하",
      dietary: ["채식"],
      allergies: ["견과류"],
      accessibility: ["계단 없는 입구"],
      disclosure: "minimal",
    },
  }));

  assert.match(html, /추가 조건 3개 적용 중/);
  for (const label of ["식이 조건", "알레르기", "접근성 조건"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /추가 조건[^<]*목적지 공개 수준/);
  assert.doesNotMatch(html, /name="allergies"/);
  assert.match(html, /name="disclosure"/);
  assert.match(html, /option value="minimal" selected/);
});

test("guarded recovery renders a distinct review for every preserved Stop reason", () => {
  const cases = [
    ["safety", "안전 문제", /안전 관련 조건/, /새 추천을 원하는지/],
    ["route_sensor", "경로 또는 센서 문제", /재보정/, /저장 경로/],
    ["condition_mismatch", "필수 조건 불일치", /맞지 않았던 필수 조건/, /수정하거나 다시 확인/],
    ["venue_problem", "장소 현장 문제", /현장에서 문제가 된 사항/, /관련 조건/],
    ["change_of_mind", "단순 변심", /모든 조건/, /다시 확인/],
    ["schedule_change", "일정 변경", /이전 여정은 종료되었어요/, /자동으로 새 추천을 시작하지 않아요/],
    ["skipped", "이유 건너뜀", /종료 이유를 건너뛰었어요/, /새 출발 조건/],
  ];

  for (const [reason, label, prompt, instruction] of cases) {
    const html = screens.renderProductScreen(view({
      guardedRecovery: true,
      recoveryReason: reason,
      recoveryReviewed: false,
    }));
    assert.match(html, new RegExp(label), reason);
    assert.match(html, prompt, reason);
    assert.match(html, instruction, reason);
    assert.equal((html.match(/name="recoveryReviewed"/g) || []).length, 1, reason);
    assert.equal((html.match(/data-action="start"/g) || []).length, 1, reason);
    assert.match(html, />이 조건으로 바로 출발<\/button>/, reason);
  }
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

test("revealed identity remains escaped during route recovery and recomputing", () => {
  for (const phase of ["route_recovery", "recomputing"]) {
    const html = screens.renderProductScreen(view({
      phase,
      revealed: true,
      needleMode: "searching",
      confidence: phase === "route_recovery" ? "low" : "recomputing",
      destination: {
        name: "바람식당 <script>",
        address: "서울시 테스트로 1",
        building: "테스트 빌딩",
        floorUnit: "2층",
        entrance: "동쪽 출입구",
      },
    }));

    assert.match(html, /목적지 공개됨/, phase);
    assert.match(html, /바람식당 &lt;script&gt;/, phase);
    assert.doesNotMatch(html, /<script>/, phase);
  }
});

test("pre-Reveal recovery and recomputing expose no identity", () => {
  for (const phase of ["route_recovery", "recomputing"]) {
    const html = screens.renderProductScreen(view({
      phase,
      revealed: false,
      destination: null,
      needleMode: "searching",
    }));
    assert.doesNotMatch(html, /목적지 공개됨|destination-name/, phase);
  }
});

test("external map warning requires explicit confirmation", () => {
  const html = screens.renderProductScreen(view({ phase: "external_map_warning" }));
  assert.match(html, /목적지가 공개될 수 있습니다/);
  assert.match(html, /data-action="cancel-external-map"/);
  assert.match(html, /data-action="confirm-external-map"/);
});

test("arrival renders escaped exact assistance fields", () => {
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

test("every missing arrival assistance field has an independent unknown label", () => {
  const complete = {
    name: "바람식당",
    address: "서울시 테스트로 1",
    building: "테스트 빌딩",
    floorUnit: "2층",
    entrance: "동쪽 출입구",
  };
  const cases = [
    ["name", "상호명 정보 없음"],
    ["address", "주소 정보 없음"],
    ["building", "건물 정보 없음"],
    ["floorUnit", "층 정보 없음"],
    ["entrance", "입구 정보 없음"],
  ];

  for (const [field, expected] of cases) {
    const html = screens.renderProductScreen(view({
      phase: "arrived",
      revealed: true,
      destination: { ...complete, [field]: null },
    }));
    assert.match(html, new RegExp(expected), field);
  }
});

test("no-fit identifies affected fields and escapes their labels", () => {
  const html = screens.renderProductScreen(view({
    errors: { finding: "필수 조건을 모두 충족하는 장소를 찾지 못했습니다." },
    affectedConditions: [
      { field: "allergies", label: "견과류 <script>" },
      { field: "accessibility", label: "계단 없는 입구" },
    ],
  }));

  assert.match(html, /다시 확인할 조건/);
  assert.match(html, /data-condition="allergies"/);
  assert.match(html, /견과류 &lt;script&gt;/);
  assert.match(html, /계단 없는 입구/);
  assert.doesNotMatch(html, /<script>/);
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

test("screen headings are programmatically focusable and renderApp moves focus", () => {
  for (const phase of ["onboarding", "constraints", "following", "arrived", "complete"]) {
    const html = screens.renderProductScreen(view({
      phase,
      destination: phase === "arrived" ? {
        name: "바람식당", address: "서울시 테스트로 1", building: null,
        floorUnit: null, entrance: null,
      } : null,
    }));
    assert.match(html, /<h1[^>]*data-screen-heading[^>]*tabindex="-1"/, phase);
  }

  const focused = [];
  const focusTarget = { focus: (options) => focused.push(options) };
  const root = {
    innerHTML: "",
    querySelector(selector) {
      return selector === "[data-screen-heading]" ? focusTarget : null;
    },
  };
  const controlsRoot = { innerHTML: "" };
  screens.renderApp(root, controlsRoot, view());

  assert.deepEqual(focused, [{ preventScroll: true }]);
});
