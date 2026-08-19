"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const path = require("node:path");
const screens = require("./screens.js");

test("screens expose the CommonJS API under the Roll the compass browser namespace", () => {
  assert.equal(globalThis.RollTheCompassVNextScreens, screens);
  assert.equal(globalThis.SomewhereVNextScreens, undefined);
});

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
      disclosure: "standard",
    },
    errors: {},
    affectedConditions: [],
    distanceM: null,
    bearingDeg: null,
    needleMode: "searching",
    confidence: "unavailable",
    currentHeading: null,
    nextStep: null,
    distanceToNextM: null,
    remainingDistanceM: null,
    routeStatus: "unavailable",
    menu: null,
    priceBand: null,
    destination: null,
    revealed: false,
    profileMenuOpen: false,
    ...overrides,
  };
}

test("splash renders only the Roll the compass wordmark and loading ring", () => {
  const html = screens.renderProductScreen(view({ phase: "splash" }));
  assert.match(html, /class="product-screen splash-screen"/);
  assert.match(html, /Roll the compass!/);
  assert.match(html, /class="splash-loader"/);
  assert.doesNotMatch(html, /시작하기|목적지는|product-controls/);
});

test("product screens render English UI copy", () => {
  const constraints = screens.renderProductScreen(view());
  assert.match(constraints, /<h2 id="condition-settings-title">Conditions<\/h2>/);
  assert.match(constraints, /Party size|Walk time|Budget/);
  assert.doesNotMatch(constraints, /조건 설정|함께 가는 인원|도보 시간|예산/);

  const profile = screens.renderProductScreen(view({
    phase: "profile_setup",
    profile: { dietary: [], allergies: [] },
  }));
  assert.match(profile, /Dietary preferences|Allergies/);
  assert.doesNotMatch(profile, /식이 조건|알레르기/);

  const following = screens.renderProductScreen(view({
    phase: "following",
    routeStatus: "ready",
    nextStep: { maneuver: "STRAIGHT", instruction: "Continue for 180 m" },
    distanceToNextM: 180,
    remainingDistanceM: 850,
    needleMode: "pointing",
    bearingDeg: 40,
    confidence: "ready",
    menu: "Noodles",
    priceBand: "$$",
  }));
  assert.match(following, /Next action|To destination|Stop/);
  assert.doesNotMatch(following, /다음 행동|목적지까지|안내 멈추기/);
});

test("all product typography uses Pretendard for readable consistency", () => {
  const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard/);
  assert.doesNotMatch(html, /Pirata\s*\+?One/);
  assert.doesNotMatch(css, /Pirata One|display-font/);
  assert.match(css, /--ui-font:\s*["']Pretendard["']/);
  assert.match(css, /h1[\s\S]*font-family:\s*var\(--ui-font\)/);
  assert.match(css, /body[\s\S]*font-family:\s*var\(--ui-font\)/);
  assert.match(css, /\.prototype-controls[\s\S]*font-family:\s*var\(--ui-font\)/);
});

test("place reaction uses thumb buttons with a separate visit exception", () => {
  const html = screens.renderProductScreen(view({ phase: "place_reaction" }));
  const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");

  assert.match(html, /class="reaction-actions"/);
  assert.match(html, /class="reaction-button reaction-button-negative"/);
  assert.match(html, /class="reaction-button reaction-button-positive"/);
  assert.match(html, /data-reaction="dislike"/);
  assert.match(html, /data-reaction="like"/);
  assert.match(html, /class="reaction-icon reaction-icon-down"/);
  assert.match(html, /class="reaction-icon reaction-icon-up"/);
  assert.match(html, /aria-label="Not for me"/);
  assert.match(html, /aria-label="Good"/);
  assert.match(html, /class="reaction-secondary"[^>]*data-reaction="did_not_visit"/);
  assert.doesNotMatch(html, /data-reaction="love"/);
  assert.equal((html.match(/data-action="react"/g) || []).length, 3);
  assert.match(css, /\.reaction-actions[\s\S]*grid-template-columns:\s*repeat\(2/);
  assert.match(css, /\.reaction-button[\s\S]*\.reaction-icon/);
  assert.match(css, /\.product-screen\[data-visual-style="a"\]:not\(\.splash-screen\) button\.reaction-button/);
  assert.match(css, /\.product-screen\[data-visual-style="a"\]:not\(\.splash-screen\) button\.reaction-secondary/);
  assert.match(css, /\.reaction-secondary/);
});

test("temporary Roll the compass wordmarks add two points of tracking", () => {
  const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
  const splashStart = css.indexOf(".splash-wordmark {");
  const splashEnd = css.indexOf("}", splashStart);
  const splashRule = splashStart >= 0 && splashEnd >= 0 ? css.slice(splashStart, splashEnd + 1) : "";
  const launchStart = css.indexOf(".launch-header h1 {");
  const launchEnd = css.indexOf("}", launchStart);
  const launchRule = launchStart >= 0 && launchEnd >= 0 ? css.slice(launchStart, launchEnd + 1) : "";

  assert.match(splashRule, /letter-spacing:\s*calc\(-0\.07em\s*\+\s*2pt\);/);
  assert.match(launchRule, /letter-spacing:\s*calc\(-0\.03em\s*\+\s*2pt\);/);
  assert.match(css, /\.product-screen\[data-phase="onboarding"\]\s*>\s*h1/);
});

test("renderApp hides prototype controls during the splash", () => {
  const root = { innerHTML: "" };
  const controlsRoot = { innerHTML: "" };

  screens.renderApp(root, controlsRoot, view({ phase: "splash" }));

  assert.match(root.innerHTML, /splash-screen/);
  assert.equal(controlsRoot.innerHTML, "");
});

test("constraints show one compass start action and collapsed advanced settings", () => {
  const html = screens.renderProductScreen(view());
  assert.match(html, /<button[^>]*class="compass-shell compass-action"[^>]*data-action="start"/);
  assert.match(html, /aria-label="Start with these conditions"/);
  assert.match(html, /compass-needle is-ready/);
  assert.doesNotMatch(html, /class="compass-action-label"/);
  assert.doesNotMatch(html, />Start with these conditions<\/button>/);
  assert.match(html, /<details[^>]*data-advanced-conditions/);
  assert.doesNotMatch(html, /<details[^>]*data-advanced-conditions[^>]*\sopen(?:\s|>)/);
  assert.equal((html.match(/data-action="start"/g) || []).length, 1);
  assert.doesNotMatch(html, /Reroll|다시 추천/);
});

test("compass screens use the supplied compass face and needle image layers", () => {
  for (const asset of ["compass-body.png", "compass-needle.png"]) {
    assert.equal(fs.existsSync(path.join(__dirname, "assets", asset)), true, asset);
  }

  const html = screens.renderProductScreen(view({
    phase: "following",
    bearingDeg: 40,
    needleMode: "pointing",
    confidence: "ready",
  }));
  assert.match(html, /<img class="compass-face" src="\.\/assets\/compass-body\.png" alt="" aria-hidden="true">/);
  assert.match(html, /<span class="compass-needle is-pointing"[^>]*><img class="compass-needle-image" src="\.\/assets\/compass-needle\.png" alt="">/);
  assert.match(html, /style="--bearing:40deg"/);
});

test("compass face compensates for transparent asset padding", () => {
  const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
  const start = css.indexOf(".compass-face {");
  const end = css.indexOf("}", start);
  const faceRule = start >= 0 && end >= 0 ? css.slice(start, end + 1) : "";

  assert.match(faceRule, /inset:\s*-6%;/);
  assert.match(faceRule, /width:\s*112%;/);
  assert.match(faceRule, /height:\s*112%;/);
});

test("compass scales up as one body while keeping the original single-sided needle", () => {
  const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
  assert.match(css, /--compass-size:\s*min\(78vw,\s*320px\);/);
  assert.doesNotMatch(css, /compass-needle-back|compass-needle-rear|needle-back/);

  const html = screens.renderProductScreen(view({
    phase: "following",
    bearingDeg: 40,
    needleMode: "pointing",
    confidence: "ready",
  }));
  assert.equal((html.match(/src="\.\/assets\/compass-needle\.png"/g) || []).length, 1);
  assert.doesNotMatch(html, /compass-needle-back|compass-needle-rear/);
});

test("needle scales down inside the enlarged compass without changing the body size", () => {
  const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
  const start = css.indexOf(".compass-needle-image {");
  const end = css.indexOf("}", start);
  const needleRule = start >= 0 && end >= 0 ? css.slice(start, end + 1) : "";

  assert.match(css, /--compass-size:\s*min\(78vw,\s*320px\);/);
  assert.match(needleRule, /top:\s*12%;/);
  assert.match(needleRule, /left:\s*26%;/);
  assert.match(needleRule, /width:\s*48%;/);
  assert.match(needleRule, /height:\s*48%;/);
});

test("compass keeps the full face visible while rotating only the contained needle", () => {
  const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
  const start = css.indexOf(".compass-shell {");
  const end = css.indexOf("}", start);
  const shellRule = start >= 0 && end >= 0 ? css.slice(start, end + 1) : "";
  const needleStart = css.indexOf(".compass-needle-image {");
  const needleEnd = css.indexOf("}", needleStart);
  const needleRule = needleStart >= 0 && needleEnd >= 0 ? css.slice(needleStart, needleEnd + 1) : "";

  assert.doesNotMatch(shellRule, /overflow:\s*hidden;/);
  assert.match(needleRule, /transform-origin:\s*50%\s+80%;/);
  assert.match(css, /\.compass-needle\.is-pointing \.compass-needle-image\s*\{\s*transform:\s*rotate\(var\(--bearing\)\);/s);
  assert.match(css, /\.compass-needle\.is-searching \.compass-needle-image\s*\{\s*animation:\s*searching-direction/s);
});

test("constraints keep the launch viewport before the below-fold settings", () => {
  const html = screens.renderProductScreen(view());
  assert.ok(html.indexOf("constraints-launch") < html.indexOf("Conditions"));
  assert.match(html, /<section[^>]*class="condition-settings"[^>]*id="condition-settings"/);
  assert.match(html, /href="#condition-settings"[^>]*>Conditions<\/a>/);
  assert.ok(html.indexOf('data-action="start"') < html.indexOf('id="condition-settings"'));
});

test("utility screens keep labels and actions without explanatory helper copy", () => {
  const constraints = screens.renderProductScreen(view());
  assert.match(constraints, /<h2 id="condition-settings-title">Conditions<\/h2>/);
  assert.doesNotMatch(constraints, /지금 필요한 조건|출발 전에 필요한 값을|나침반을 눌러 한 곳으로 출발해요/);

  const finding = screens.renderProductScreen(view({ phase: "finding" }));
  assert.doesNotMatch(finding, /조건에 맞는 목적지와 걸을 길을 확인 중이에요/);

  const following = screens.renderProductScreen(view({
    phase: "following", distanceM: 850, bearingDeg: 40,
    needleMode: "pointing", confidence: "ready", menu: "국수", priceBand: "중간",
    routeStatus: "ready", nextStep: { maneuver: "STRAIGHT", instruction: "현재 길로 180m 직진해요" },
    distanceToNextM: 180, remainingDistanceM: 850,
  }));
  assert.doesNotMatch(following, /class="guidance-status"|길을 따라가고 있어요|정보 비공개 상태로 안내 중이에요/);
  assert.doesNotMatch(following, /현재 길로|다음 안내를 확인해 주세요/);
  assert.match(following, /Next action|To destination/);

  const paused = screens.renderProductScreen(view({ phase: "paused" }));
  assert.doesNotMatch(paused, /언제든 다시 이어갈 수 있어요/);

  const recovery = screens.renderProductScreen(view({ phase: "route_recovery", routeStatus: "recovery" }));
  assert.doesNotMatch(recovery, /현재 방향을 신뢰하기 어려워서 정확한 방향을 확인하고 있어요/);
});

test("secondary utility screens omit standalone helper paragraphs", () => {
  for (const phase of ["stop_confirm", "stop_reason", "stopped", "external_map_handoff", "feedback_pending", "complete"]) {
    const html = screens.renderProductScreen(view({ phase }));
    assert.doesNotMatch(html, /<p(?:\s|>)/, phase);
  }

  const noFit = screens.renderProductScreen(view({
    errors: { finding: "No place matched all required conditions." },
    affectedConditions: [{ field: "budget", label: "예산" }],
  }));
  assert.doesNotMatch(noFit, /조건은 자동으로 완화되지 않았어요/);
});

test("constraints expose smooth scroll actions in both directions", () => {
  const html = screens.renderProductScreen(view());
  assert.match(html, /id="constraints-launch"/);
  assert.match(html, /href="#condition-settings"[^>]*data-action="scroll-to-conditions"/);
  assert.match(html, /data-action="scroll-to-launch"[^>]*>Done<\/button>/);
});

test("constraints no longer expose accessibility as an active condition", () => {
  const html = screens.renderProductScreen(view({
    constraints: { ...view().constraints, accessibility: ["계단 없는 입구"] },
  }));
  assert.doesNotMatch(html, /접근성 조건/);
  assert.doesNotMatch(html, /name="accessibility"/);
});

test("constraints fix the category to restaurant and expose time and budget sliders", () => {
  const html = screens.renderProductScreen(view());
  assert.doesNotMatch(html, /어디로 갈까요|value="cafe"|카페/);
  assert.match(html, /name="maxWalkMinutes"[^>]*type="range"/);
  assert.match(html, /min="5"[^>]*max="60"[^>]*step="5"/);
  assert.match(html, /name="budget"[^>]*type="range"/);
  assert.match(html, /data-budget-unlimited/);
  assert.match(html, /Any budget/);
  const withBudget = screens.renderProductScreen(view({
    constraints: { ...view().constraints, budget: 4_000 },
  }));
  assert.match(withBudget, /4,000 or less/);
});

test("constraints render the party selector before walking time", () => {
  const html = screens.renderProductScreen(view({
    constraints: { ...view().constraints, partySize: 3 },
  }));
  assert.ok(html.indexOf("Party size") < html.indexOf("Walk time"));
  assert.match(html, /data-action="party-decrement"/);
  assert.match(html, /data-action="party-increment"/);
  assert.match(html, /aria-live="polite"[^>]*>3 people/);
  assert.equal((html.match(/data-party-pawn/g) || []).length, 3);
});

test("five or more renders five pawns and disables the increment control", () => {
  const html = screens.renderProductScreen(view({
    constraints: { ...view().constraints, partySize: 5 },
  }));
  assert.match(html, /5\+ people/);
  assert.equal((html.match(/data-party-pawn/g) || []).length, 5);
  assert.match(html, /data-action="party-increment"[^>]*disabled/);
});

test("constraints expose a direct gear settings button instead of a profile menu", () => {
  const html = screens.renderProductScreen(view({ profileMenuOpen: false }));
  assert.match(html, /data-action="open-profile-settings"/);
  assert.match(html, /aria-label="Settings"/);
  assert.match(html, /class="settings-button"/);
  assert.match(html, /class="settings-icon"/);
  assert.doesNotMatch(html, /data-action="open-profile-menu"|class="profile-menu"|로그아웃/);
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
  assert.match(high, /30,000 or less/);
});

test("minimal disclosure is the default and private is the optional choice", () => {
  const html = screens.renderProductScreen(view({
    constraints: { ...view().constraints, disclosure: "minimal" },
  }));
  assert.match(html, /Minimal \(walk time · budget · signature dish\)/);
  assert.match(html, /Private/);
  assert.match(html, /option value="minimal" selected/);
  assert.doesNotMatch(html, /기본 비공개/);
});

test("profile screens expose searchable multi-select diet and allergy pickers", () => {
  for (const phase of ["profile_setup", "profile"]) {
    const html = screens.renderProductScreen(view({ phase, profile: {
      dietary: ["vegetarian"], allergies: ["peanut"],
    } }));
    assert.match(html, /Dietary preferences/);
    assert.match(html, /Allergies/);
    assert.match(html, /data-picker-search="dietary"/);
    assert.match(html, /data-picker-search="allergies"/);
    assert.match(html, /type="checkbox"[^>]*name="dietary"/);
    assert.match(html, /type="checkbox"[^>]*name="allergies"/);
    assert.doesNotMatch(html, /식이 조건과 알레르기는|검색해서 선택할 수 있어요/);
  }
});

test("A system profile treatment keeps dietary and allergy options text-only", () => {
  const html = screens.renderProductScreen(view({
    phase: "profile_setup",
    profile: { dietary: [], allergies: [] },
  }));
  assert.match(html, /data-visual-style="a"/);
  assert.doesNotMatch(html, /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u);
  assert.doesNotMatch(html, /class="(?:dietary|allergy)-emoji"/);
  assert.doesNotMatch(html, /<img[^>]+(?:dietary|allergy)/i);
});

test("A system profile treatment groups allergy settings in a distinct box", () => {
  const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
  const flatLayer = css.split("/* A refinement: cardless utility surfaces */")[1] ?? "";
  const selector = '.product-screen[data-visual-style="a"] .profile-picker[data-profile-picker="allergies"]';
  const ruleStart = flatLayer.indexOf(selector);
  const ruleEnd = flatLayer.indexOf("}", ruleStart);
  const rule = ruleStart >= 0 && ruleEnd >= 0 ? flatLayer.slice(ruleStart, ruleEnd + 1) : "";

  assert.match(rule, /padding:\s*16px;/);
  assert.match(rule, /border:\s*1px solid var\(--system-line\);/);
  assert.match(rule, /border-radius:\s*18px;/);
  assert.match(rule, /background:\s*var\(--system-grouped\);/);
});

test("A system profile treatment groups dietary settings in a distinct box", () => {
  const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
  const flatLayer = css.split("/* A refinement: cardless utility surfaces */")[1] ?? "";
  const selector = '.product-screen[data-visual-style="a"] .profile-picker[data-profile-picker="dietary"]';
  const ruleStart = flatLayer.indexOf(selector);
  const ruleEnd = flatLayer.indexOf("}", ruleStart);
  const rule = ruleStart >= 0 && ruleEnd >= 0 ? flatLayer.slice(ruleStart, ruleEnd + 1) : "";

  assert.match(rule, /padding:\s*16px;/);
  assert.match(rule, /border:\s*1px solid var\(--system-line\);/);
  assert.match(rule, /border-radius:\s*18px;/);
  assert.match(rule, /background:\s*var\(--system-grouped\);/);
});

test("profile pickers use specific dietary taxonomy and the 19-allergen set", () => {
  const html = screens.renderProductScreen(view({ phase: "profile" }));
  for (const label of [
    "Vegan", "Lacto", "Ovo", "Lacto-ovo", "Pescatarian", "Pollo-pescatarian", "Flexitarian", "Halal", "Kosher", "Low sodium",
  ]) {
    assert.match(html, new RegExp(label), label);
  }
  for (const label of [
    "Egg", "Milk", "Buckwheat", "Peanut", "Soy", "Wheat", "Mackerel", "Crab", "Shrimp", "Pork",
    "Peach", "Tomato", "Sulfites", "Walnut", "Chicken", "Beef", "Squid", "Shellfish", "Pine nut",
  ]) {
    assert.match(html, new RegExp(label), label);
  }
  assert.equal((html.match(/class="profile-choice-input"/g) || []).length, 31);
  assert.match(html, /Shellfish \(oyster, abalone, mussel\)/);
  assert.doesNotMatch(html, /tree_nut|Korean nut/);
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
  assert.match(html, /Dietary preferences options\. Four items visible\./);
  assert.match(html, /Allergies options\. Four items visible\./);
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
  assert.doesNotMatch(html, /정보 비공개 상태로 안내 중이에요/);
  assert.doesNotMatch(html, /<dt>남은 거리<\/dt>|<dt>대표 메뉴<\/dt>|<dt>가격대<\/dt>/);
});

test("onboarding keeps the direct action without helper copy", () => {
  const html = screens.renderProductScreen(view({ phase: "onboarding" }));
  assert.match(html, /<h1[^>]*>Roll the compass!<\/h1>/);
  assert.doesNotMatch(html, /목적지는 도착하거나 직접 확인할 때까지 숨겨져 있어요/);
});

test("collapsed advanced conditions summarize every active type and preserve disclosure", () => {
  const html = screens.renderProductScreen(view({
    constraints: {
      category: "restaurant",
      maxWalkMinutes: 20,
      budget: "20,000원 이하",
      dietary: ["채식"],
      allergies: ["견과류"],
      disclosure: "minimal",
    },
  }));

  assert.match(html, /2 additional conditions/);
  for (const label of ["Dietary", "Allergies"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /additional conditions[^<]*Disclosure/);
  assert.doesNotMatch(html, /name="allergies"/);
  assert.match(html, /name="disclosure"/);
  assert.match(html, /option value="minimal" selected/);
});

test("guarded recovery renders a distinct review for every preserved Stop reason", () => {
  const cases = [
    ["safety", "Safety issue", /Check the safety conditions/, /new recommendation/],
    ["route_sensor", "Route or sensor issue", /recalibration/, /saved route/],
    ["condition_mismatch", "Required condition mismatch", /required condition/, /Conditions will not be relaxed/],
    ["venue_problem", "Venue issue", /issue at the venue/, /related condition/],
    ["change_of_mind", "Changed your mind", /Review all conditions/, /press Start/],
    ["schedule_change", "Schedule change", /current schedule/, /automatically/],
    ["skipped", "Reason skipped", /stop reason was skipped/, /new starting conditions/],
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
    assert.match(html, /class="compass-shell compass-action"/, reason);
    assert.match(html, /aria-label="Start with these conditions"/, reason);
  }
});

test("finding reuses the compass shell with a searching needle", () => {
  const html = screens.renderProductScreen(view({ phase: "finding" }));
  assert.match(html, /class="compass-shell"/);
  assert.match(html, /compass-needle is-searching/);
  assert.doesNotMatch(html, /compass-needle is-pointing|data-action="start"/);
});

test("phase descriptions do not render as large visible titles", () => {
  for (const phase of [
    "profile_setup", "profile", "finding", "following", "following_revealed", "near", "paused",
    "reveal_reason", "revealed", "arrived", "stop_confirm", "stop_reason", "stopped",
    "route_recovery", "recomputing", "external_map_warning", "external_map_handoff",
    "feedback_pending", "place_reaction", "complete",
  ]) {
    const html = screens.renderProductScreen(view({ phase }));
    const headings = [...html.matchAll(/<h1([^>]*)>/g)];
    assert.ok(headings.length >= 1, phase);
    assert.ok(
      headings.every(([, attributes]) => attributes.includes("screen-heading-visually-hidden")),
      phase,
    );
  }
});

test("following and near keep the compass needle with concise navigation guidance", () => {
  const following = screens.renderProductScreen(view({
    phase: "following", distanceM: 850, bearingDeg: 40,
    currentHeading: "동쪽", nextStep: {
      maneuver: "STRAIGHT", instruction: "180m 뒤까지 직진해요", road: "테스트로",
    }, distanceToNextM: 180, remainingDistanceM: 850, routeStatus: "ready",
    needleMode: "pointing", confidence: "ready", menu: "국수", priceBand: "중간",
  }));
  const near = screens.renderProductScreen(view({
    phase: "near", distanceM: 70, bearingDeg: 12,
    currentHeading: "남쪽", nextStep: {
      maneuver: "ARRIVE", instruction: "70m 뒤 목적지 근처에 도착해요", road: null,
    }, distanceToNextM: 70, remainingDistanceM: 70, routeStatus: "ready",
    needleMode: "pointing", confidence: "ready", menu: "국수", priceBand: "중간",
  }));
  assert.match(following, /class="navigation-guidance/);
  assert.match(near, /class="navigation-guidance/);
  assert.match(following, /class="compass-shell"/);
  assert.match(following, /compass-needle is-pointing/);
  assert.match(following, /style="--bearing:40deg"/);
  assert.match(near, /class="compass-shell"/);
  assert.doesNotMatch(following, /현재 방향/);
  assert.doesNotMatch(following, /destination-name|목적지 정보 확인/);
  assert.match(following, /data-action="stop"/);
});

test("following renders the compass needle, next maneuver, and total remaining distance", () => {
  const html = screens.renderProductScreen(view({
    phase: "following",
    bearingDeg: 40,
    needleMode: "pointing",
    confidence: "ready",
    currentHeading: "동쪽",
    nextStep: {
      maneuver: "TURN_RIGHT",
      instruction: "120m 뒤 오른쪽으로 돌아요",
      road: "테스트길",
    },
    distanceToNextM: 120,
    remainingDistanceM: 680,
    routeStatus: "ready",
    menu: "국수",
    priceBand: "중간",
  }));

  assert.match(html, /class="navigation-guidance/);
  assert.match(html, /class="compass-shell"/);
  assert.match(html, /compass-needle is-pointing/);
  assert.match(html, /Turn right/);
  assert.match(html, /120m/);
  assert.match(html, /680m/);
  assert.doesNotMatch(html, /현재 방향/);
  assert.doesNotMatch(html, /destination-name|서울시 테스트로/);
});

test("recovery and pause render status without an active maneuver", () => {
  const recovery = screens.renderProductScreen(view({
    phase: "route_recovery",
    routeStatus: "recovery",
    currentHeading: null,
    nextStep: null,
    distanceToNextM: null,
    remainingDistanceM: 680,
  }));
  const paused = screens.renderProductScreen(view({
    phase: "paused",
    routeStatus: "paused",
    currentHeading: null,
    nextStep: null,
    distanceToNextM: null,
    remainingDistanceM: 680,
  }));

  assert.match(recovery, /Recalculating route/);
  assert.match(paused, /Paused/);
  assert.doesNotMatch(recovery, /Right|Left|Straight/);
  assert.doesNotMatch(paused, /Right|Left|Straight/);
  assert.match(recovery, /class="compass-shell"/);
  assert.match(recovery, /compass-needle is-searching/);
  assert.match(paused, /class="compass-shell"/);
  assert.match(paused, /compass-needle is-paused/);
});

test("recovery guidance never invents a maneuver from a missing route", () => {
  for (const phase of ["following", "route_recovery", "recomputing"]) {
    const html = screens.renderProductScreen(view({
      phase,
      bearingDeg: null,
      needleMode: "searching",
      confidence: phase === "route_recovery" ? "low" : "recomputing",
      routeStatus: phase === "following" ? "unavailable" : "recovery",
    }));
    assert.match(html, /navigation-guidance is-unavailable/);
    assert.doesNotMatch(html, /--bearing:0deg/);
    assert.match(html, /compass-shell/);
    assert.match(html, /compass-needle is-searching/);
    assert.match(html, /Checking route|Recalculating route|Paused/);
  }
});

test("paused guidance has no active maneuver or directional claim", () => {
  const html = screens.renderProductScreen(view({
    phase: "paused", needleMode: "paused", confidence: "paused",
    routeStatus: "paused", remainingDistanceM: 70,
  }));
  assert.match(html, /navigation-guidance is-unavailable/);
  assert.match(html, /compass-shell/);
  assert.match(html, /compass-needle is-paused/);
  assert.doesNotMatch(html, /is-pointing|is-searching|--bearing/);
  assert.match(html, /Paused/);
});

test("paused and reveal reason screens expose the approved branch controls", () => {
  const paused = screens.renderProductScreen(view({
    phase: "paused", needleMode: "paused", confidence: "paused",
  }));
  const reason = screens.renderProductScreen(view({ phase: "reveal_reason", confidence: "paused" }));
  assert.match(paused, /Resume/);
  assert.match(paused, /View destination/);
  assert.match(paused, /End guidance/);
  assert.match(reason, /Skip and reveal/);
  assert.doesNotMatch(reason, /exact location will be revealed/);
  assert.equal((reason.match(/data-action="reveal-destination"/g) || []).length, 7);
});

test("stop confirmation provides a semantic route back to guidance", () => {
  const html = screens.renderProductScreen(view({ phase: "stop_confirm", needleMode: "paused" }));
  assert.match(html, /data-action="continue-guidance"/);
  assert.match(html, /data-action="confirm-end"/);
});

test("route recovery keeps recalculation copy accurate and preserves the Stop exit", () => {
  const html = screens.renderProductScreen(view({
    phase: "route_recovery", needleMode: "searching", confidence: "low",
    routeStatus: "recovery",
  }));
  assert.match(html, /navigation-guidance is-unavailable/);
  assert.match(html, /compass-shell/);
  assert.match(html, /compass-needle is-searching/);
  assert.match(html, /Recalculating route/);
  assert.doesNotMatch(html, /needle stopped/);
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

    assert.match(html, /Destination revealed/, phase);
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
    assert.doesNotMatch(html, /Destination revealed|destination-name/, phase);
  }
});

test("external map warning requires explicit confirmation", () => {
  const html = screens.renderProductScreen(view({ phase: "external_map_warning" }));
  assert.match(html, /The destination may be revealed in an external map/);
  assert.match(html, /data-action="cancel-external-map"/);
  assert.match(html, /data-action="confirm-external-map"/);
});

test("arrival renders escaped curated destination details", () => {
  const html = screens.renderProductScreen(view({
    phase: "arrived",
    revealed: true,
    destination: {
      name: "식당 <script>", address: "서울시 테스트로 1",
      photoUrl: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
      building: "테스트 빌딩", floorUnit: null, entrance: "동쪽 출입구",
      recommendationReason: "조건 균형이 좋아요 <script>",
      reviewSummary: "담백하다는 후기가 많아요.",
    },
  }));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /식당 &lt;script&gt;/);
  assert.match(html, /class="destination-photo"/);
  assert.match(html, /alt="식당 &lt;script&gt; photo"/);
  assert.match(html, /Floor unavailable/);
  assert.match(html, /조건 균형이 좋아요 &lt;script&gt;/);
  assert.match(html, /담백하다는 후기가 많아요\./);
  assert.doesNotMatch(html, /서울시 테스트로 1|동쪽 출입구/);
});

test("every missing curated arrival field has an independent unknown label", () => {
  const complete = {
    name: "바람식당",
    address: "서울시 테스트로 1",
    photoUrl: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
    building: "테스트 빌딩",
    floorUnit: "2층",
    entrance: "동쪽 출입구",
    recommendationReason: "조건 균형이 좋아요.",
    reviewSummary: "후기가 좋아요.",
  };
  const cases = [
    ["name", "Place name unavailable"],
    ["photoUrl", "No photo available"],
    ["building", "Building unavailable"],
    ["floorUnit", "Floor unavailable"],
    ["recommendationReason", "Recommendation unavailable"],
    ["reviewSummary", "Review summary unavailable"],
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
    errors: { finding: "No place matched all required conditions." },
    affectedConditions: [
      { field: "allergies", label: "견과류 <script>" },
    ],
  }));

  assert.match(html, /Review these conditions/);
  assert.match(html, /data-condition="allergies"/);
  assert.match(html, /견과류 &lt;script&gt;/);
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
  assert.match(html, /Destination revealed/);
});

test("prototype controls and renderApp remain outside the product renderer", () => {
  const controls = screens.renderPrototypeControls(view());
  assert.match(controls, /<aside/);
  assert.match(controls, /프로토타입 컨트롤 — 앱 UI에 포함되지 않음/);
  for (const label of [
    "140m 이동", "더 가까이 이동", "도착", "조건 불일치", "방향 신뢰도 낮음",
    "안내 복원", "위치 권한 거부", "층 정보 없이 도착", "후기 확인 가능", "초기화",
  ]) {
    assert.match(controls, new RegExp(label));
  }
  assert.match(controls, /aria-label="프로토타입 컨트롤"/);
  assert.doesNotMatch(controls, /Prototype controls|Walk 140 m|Move closer|Low direction confidence|Reset/);
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

test("renderApp returns to the app top only when the product phase changes", () => {
  const scrolls = [];
  const root = {
    innerHTML: screens.renderProductScreen(view({ phase: "profile" })),
    querySelector(selector) {
      if (selector === ".product-screen") {
        const phase = this.innerHTML.match(/data-phase="([^"]+)"/)?.[1];
        return phase ? { dataset: { phase } } : null;
      }
      if (selector === "[data-screen-heading]") return { focus() {} };
      return null;
    },
    scrollIntoView(options) {
      scrolls.push(options);
    },
  };
  const controlsRoot = { innerHTML: "" };

  screens.renderApp(root, controlsRoot, view({ phase: "constraints" }));
  screens.renderApp(root, controlsRoot, view({ phase: "constraints", profileMenuOpen: true }));

  assert.deepEqual(scrolls, [{ block: "start" }]);
});

test("phase changes use a shared view transition when the browser supports it", () => {
  const previousDocument = globalThis.document;
  const transitions = [];
  globalThis.document = {
    startViewTransition(update) {
      transitions.push("started");
      update();
      return { finished: Promise.resolve() };
    },
  };
  try {
    const root = {
      innerHTML: screens.renderProductScreen(view({ phase: "constraints" })),
      querySelector(selector) {
        if (selector === ".product-screen") return { dataset: { phase: "constraints" } };
        if (selector === "[data-screen-heading]") return { focus() {} };
        return null;
      },
      scrollIntoView() {},
    };
    const controlsRoot = { innerHTML: "" };

    screens.renderApp(root, controlsRoot, view({ phase: "finding" }));

    assert.deepEqual(transitions, ["started"]);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("phase changes animate a compass clone when native transitions are unavailable", () => {
  const previousDocument = globalThis.document;
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  const previousTimeout = globalThis.setTimeout;
  const appended = [];
  const proxy = {
    style: {},
    setAttribute() {},
    addEventListener() {},
  };
  const oldCompass = {
    style: {},
    getBoundingClientRect: () => ({ left: 20, top: 100, width: 240, height: 240 }),
    cloneNode: () => proxy,
  };
  const newCompass = {
    style: {},
    getBoundingClientRect: () => ({ left: 160, top: 140, width: 120, height: 120 }),
  };
  let phase = "constraints";
  const root = { _html: "" };
  Object.defineProperty(root, "innerHTML", {
    get: () => root._html,
    set: (value) => {
      root._html = value;
      phase = "finding";
    },
  });
  root.querySelector = (selector) => {
    if (selector === ".product-screen") return { dataset: { phase } };
    if (selector === ".compass-shell") return phase === "constraints" ? oldCompass : newCompass;
    return null;
  };
  root.scrollIntoView = () => {};
  globalThis.document = {
    body: {
      appendChild: (node) => appended.push(node),
      removeChild: () => {},
    },
  };
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  globalThis.setTimeout = () => 1;
  try {
    screens.renderApp(root, { innerHTML: "" }, view({ phase: "finding" }));
    assert.equal(appended.length, 1);
    assert.equal(newCompass.style.visibility, "hidden");
    assert.match(proxy.style.transition, /680ms/);
    assert.match(proxy.style.transform, /translate3d\(140px, 40px, 0\)/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousAnimationFrame;
    globalThis.setTimeout = previousTimeout;
  }
});

test("A visual treatment removes decorative card chrome while keeping functional surfaces", () => {
  const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
  const flatLayer = css.split("/* A refinement: cardless utility surfaces */")[1] ?? "";

  assert.notEqual(flatLayer, "");
  assert.match(flatLayer, /\.product-screen\[data-visual-style="a"\]\:not\(\.splash-screen\)/);
  assert.match(flatLayer, /\.condition-settings/);
  assert.match(flatLayer, /\.profile-picker/);
  assert.match(flatLayer, /\.navigation-guidance/);
  assert.match(flatLayer, /\.picker-options-scroll/);
  assert.match(flatLayer, /border:\s*0;/);
  assert.match(flatLayer, /background:\s*transparent;/);
  assert.match(flatLayer, /border-block:\s*1px solid/);
});
