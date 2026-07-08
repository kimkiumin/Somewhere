"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};

const app = require("./app.js");
const destinations = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/mock_destinations.json"), "utf8"),
);

function createRoot() {
  return {
    dataset: {},
    innerHTML: "",
  };
}

test("startAdventure selects a destination but keeps the public destination hidden", () => {
  const state = app.startAdventure(destinations, { index: 0, headingDeg: 24 });
  const publicState = app.toPublicJourney(state);

  assert.equal(state.phase, "hidden");
  assert.equal(state.destination.name, "Small Independent Bookstore");
  assert.equal(publicState.destinationName, "Hidden");
  assert.equal(publicState.hint, "A quiet place with paper and light");
  assert.equal(publicState.distanceM, 720);
  assert.equal(publicState.revealAvailable, true);
});

test("moveCloser advances following to near and arrived thresholds", () => {
  const hidden = app.startAdventure(destinations, { index: 1, headingDeg: 12 });
  const following = app.beginFollowing(hidden);
  const near = app.moveCloser(following, 370);
  const arrived = app.moveCloser(near, 90);

  assert.equal(following.phase, "following");
  assert.equal(near.phase, "near");
  assert.equal(near.distanceM, 110);
  assert.equal(arrived.phase, "arrived");
  assert.equal(arrived.distanceM, 20);
});

test("moveCloser shows near before arrived when a step would overshoot it", () => {
  const hidden = app.startAdventure(destinations, { index: 0, headingDeg: 12 });
  const following = {
    ...app.beginFollowing(hidden),
    distanceM: app.NEAR_THRESHOLD_M + 5,
  };
  const near = app.moveCloser(following, app.DEFAULT_STEP_RANGE_M[1]);
  const arrived = app.moveCloser(near, app.DEFAULT_STEP_RANGE_M[0]);

  assert.equal(near.phase, "near");
  assert.equal(near.distanceM, app.ARRIVED_THRESHOLD_M + 1);
  assert.equal(arrived.phase, "arrived");
});

test("moveCloser keeps malformed distance unknown instead of inventing arrival", () => {
  const malformedDestinations = [
    {
      id: "x003",
      name: "Hidden Broken Distance",
      category: "test",
      mood: "quiet",
      initialDistanceM: "<img src=x onerror=alert(1)>",
      estimatedMinutes: 9,
      safetyLevel: "safe",
      hint: "A safe-looking hint",
      description: "A test destination.",
    },
  ];
  const hidden = app.startAdventure(malformedDestinations, { index: 0, headingDeg: 12 });
  const following = app.beginFollowing(hidden);
  const moved = app.moveCloser(following, 100);

  assert.equal(app.formatDistance(following.distanceM), "Unknown");
  assert.equal(moved.phase, "following");
  assert.equal(moved.distanceM, following.distanceM);
  assert.equal(app.formatDistance(moved.distanceM), "Unknown");
});

test("reveal exposes the destination name and give up remains neutral", () => {
  const hidden = app.startAdventure(destinations, { index: 2, headingDeg: 48 });
  const abandoned = app.giveUp(hidden);
  const revealed = app.revealDestination(abandoned);
  const publicState = app.toPublicJourney(revealed);

  assert.equal(abandoned.phase, "give-up");
  assert.equal(abandoned.revealed, false);
  assert.equal(revealed.phase, "revealed");
  assert.equal(publicState.destinationName, "Tiny Local Gallery");
  assert.equal(publicState.canStartAgain, true);
});

test("reroll selects a different hidden destination without revealing the previous one", () => {
  const first = app.startAdventure(destinations, { index: 0, headingDeg: 24 });
  const rerolled = app.rerollAdventure(first, destinations, { index: 2, headingDeg: 82 });
  const publicState = app.toPublicJourney(rerolled);

  assert.equal(rerolled.phase, "reroll");
  assert.equal(rerolled.destination.name, "Pocket Park Viewpoint");
  assert.notEqual(rerolled.destination.id, first.destination.id);
  assert.equal(rerolled.distanceM, rerolled.destination.initialDistanceM);
  assert.equal(rerolled.previousDestinationName, undefined);
  assert.equal(publicState.destinationName, "Hidden");
  assert.equal(publicState.hint, "A small opening in the city");
});

test("renderApp escapes mock hint fields before inserting journey HTML", () => {
  const maliciousDestinations = [
    {
      id: "x001",
      name: "Hidden Test Place",
      category: "test",
      mood: "quiet",
      initialDistanceM: 100,
      estimatedMinutes: "<img src=x onerror=alert(1)>",
      safetyLevel: "safe",
      hint: '<img src=x onerror="globalThis.__xss = true">',
      description: "A test destination.",
    },
  ];
  const root = createRoot();
  const state = app.startAdventure(maliciousDestinations, { index: 0, headingDeg: 0 });

  app.renderApp(root, { loading: false, state });

  assert.equal(root.dataset.state, "hidden");
  assert.equal(root.innerHTML.includes("<img src=x"), false);
  assert.equal(root.innerHTML.includes("&lt;img src=x"), true);
  assert.equal(root.innerHTML.includes("Unknown"), true);
});

test("renderApp normalizes malformed distance before inserting journey HTML", () => {
  const maliciousDestinations = [
    {
      id: "x002",
      name: "Hidden Distance Test",
      category: "test",
      mood: "quiet",
      initialDistanceM: "<img src=x onerror=alert(1)>",
      estimatedMinutes: 9,
      safetyLevel: "safe",
      hint: "A safe-looking hint",
      description: "A test destination.",
    },
  ];
  const root = createRoot();
  const state = app.startAdventure(maliciousDestinations, { index: 0, headingDeg: 0 });

  app.renderApp(root, { loading: false, state });

  assert.equal(app.formatDistance("<img src=x onerror=alert(1)>"), "Unknown");
  assert.equal(app.formatDistance(null), "Unknown");
  assert.equal(app.formatDistance(""), "Unknown");
  assert.equal(app.formatDistance(false), "Unknown");
  assert.equal(app.formatDistance(-1), "Unknown");
  assert.equal(root.innerHTML.includes("<img src=x"), false);
  assert.match(root.innerHTML, /Unknown/);
});

test("formatEstimatedTime rejects missing, empty, boolean, and negative values", () => {
  assert.equal(app.formatEstimatedTime(null), "Unknown");
  assert.equal(app.formatEstimatedTime(""), "Unknown");
  assert.equal(app.formatEstimatedTime("   "), "Unknown");
  assert.equal(app.formatEstimatedTime(false), "Unknown");
  assert.equal(app.formatEstimatedTime(-1), "Unknown");
  assert.equal(app.formatEstimatedTime(9), "9 min");
});

test("renderApp shows selecting state and estimated time in the hidden panel", () => {
  const loadingRoot = createRoot();
  app.renderApp(loadingRoot, { loading: true, state: undefined });

  assert.equal(loadingRoot.dataset.state, "selecting");
  assert.match(loadingRoot.innerHTML, /Selecting/);

  const hiddenRoot = createRoot();
  const state = app.startAdventure(destinations, { index: 0, headingDeg: 24 });
  app.renderApp(hiddenRoot, { loading: false, state });

  assert.match(hiddenRoot.innerHTML, /Time/);
  assert.match(hiddenRoot.innerHTML, /12 min/);
});

test("idle copy avoids forbidden product-scope terms in visible text", () => {
  const root = createRoot();
  app.renderApp(root, { loading: false, state: undefined });

  assert.equal(/GPS|maps|accounts|APIs|reviews|ratings|search/.test(root.innerHTML), false);
});
