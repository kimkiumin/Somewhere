"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const stateApi = require("./state.js");

function validConstraints() {
  return {
    category: "restaurant",
    maxWalkMinutes: 20,
    budget: null,
    dietary: [],
    accessibility: [],
    disclosure: "standard",
  };
}

test("one start action moves valid constraints directly into finding", () => {
  const initial = stateApi.createInitialState({ firstUse: false });
  const finding = stateApi.reduce(initial, {
    type: "START",
    constraints: validConstraints(),
  });

  assert.equal(finding.phase, "finding");
  assert.equal(finding.committed, true);
  assert.equal(finding.destination, null);
});

test("invalid constraints remain editable and identify exact fields", () => {
  const initial = stateApi.createInitialState({ firstUse: false });
  const unchanged = stateApi.reduce(initial, {
    type: "START",
    constraints: { ...validConstraints(), maxWalkMinutes: 0 },
  });

  assert.equal(unchanged.phase, "constraints");
  assert.deepEqual(unchanged.errors, {
    maxWalkMinutes: "?꾨낫 ?쒓컙? 1遺??댁긽?댁뼱???⑸땲??",
  });
  assert.equal(unchanged.constraints.maxWalkMinutes, 0);
});

test("finding success begins guidance without a ready or second commit state", () => {
  const finding = stateApi.reduce(
    stateApi.createInitialState({ firstUse: false }),
    { type: "START", constraints: validConstraints() },
  );
  const following = stateApi.reduce(finding, {
    type: "FIND_SUCCESS",
    destination: {
      id: "fixture-1",
      name: "hidden restaurant",
      address: "Seoul test road 1",
      building: "Test building",
      floorUnit: "2F",
      entrance: "East entrance",
      menu: "noodles",
      priceBand: "mid",
    },
    route: { id: "route-1", distanceM: 850, bearingDeg: 40 },
  });

  assert.equal(following.phase, "following");
  assert.equal(following.committed, true);
  assert.equal(stateApi.PHASES.includes("ready"), false);
  assert.equal(stateApi.PHASES.includes("committed"), false);
});

function followingState({ revealed = false } = {}) {
  const finding = stateApi.reduce(
    stateApi.createInitialState({ firstUse: false }),
    { type: "START", constraints: validConstraints() },
  );
  const following = stateApi.reduce(finding, {
    type: "FIND_SUCCESS",
    destination: {
      id: "fixture-1", name: "Hidden restaurant", address: "Seoul test road 1",
      building: "Test building", floorUnit: "2F", entrance: "East entrance",
      menu: "noodles", priceBand: "mid",
    },
    route: { id: "route-1", distanceM: 850, bearingDeg: 40 },
  });
  if (!revealed) return following;
  const paused = stateApi.reduce(following, { type: "STOP" });
  const reason = stateApi.reduce(paused, { type: "OPEN_DESTINATION_INFO" });
  const disclosed = stateApi.reduce(reason, {
    type: "REVEAL_DESTINATION",
    reason: "skipped",
  });
  const recomputing = stateApi.reduce(disclosed, { type: "CONTINUE_AFTER_REVEAL" });
  return stateApi.reduce(recomputing, { type: "RECOVERY_READY" });
}

test("Stop pauses synchronously before any reason or confirmed end", () => {
  const paused = stateApi.reduce(followingState(), { type: "STOP" });
  assert.equal(paused.phase, "paused");
  assert.equal(paused.confidence, "paused");
  assert.equal(paused.guidanceEnded, false);
  assert.equal(paused.stopReason, null);
});

test("destination disclosure requires a reason or explicit skip after pause", () => {
  const paused = stateApi.reduce(followingState(), { type: "STOP" });
  const reason = stateApi.reduce(paused, { type: "OPEN_DESTINATION_INFO" });
  const illegal = stateApi.reduce(reason, { type: "REVEAL_DESTINATION" });
  const revealed = stateApi.reduce(reason, {
    type: "REVEAL_DESTINATION",
    reason: "skipped",
  });

  assert.equal(reason.phase, "reveal_reason");
  assert.equal(illegal, reason);
  assert.equal(revealed.phase, "revealed");
  assert.equal(revealed.revealed, true);
  assert.equal(revealed.revealReason, "skipped");
  assert.equal(revealed.stopReason, null);
});

test("public view exposes exact fields only after reveal or arrival", () => {
  const following = followingState();
  const hidden = stateApi.toPublicView(following);
  const paused = stateApi.reduce(following, { type: "STOP" });
  const reason = stateApi.reduce(paused, { type: "OPEN_DESTINATION_INFO" });
  const revealed = stateApi.reduce(reason, {
    type: "REVEAL_DESTINATION",
    reason: "route_difficulty",
  });
  const publicRevealed = stateApi.toPublicView(revealed);

  assert.equal(hidden.destination, null);
  assert.equal(JSON.stringify(hidden).includes("Test building"), false);
  assert.deepEqual(publicRevealed.destination, {
    name: "Hidden restaurant",
    address: "Seoul test road 1",
    building: "Test building",
    floorUnit: "2F",
    entrance: "East entrance",
  });
});

test("confirmed end asks a distinct skippable Stop reason after ending", () => {
  const paused = stateApi.reduce(followingState(), { type: "STOP" });
  const confirm = stateApi.reduce(paused, { type: "REQUEST_END" });
  const reason = stateApi.reduce(confirm, { type: "CONFIRM_END", nowMs: 1000 });
  const stopped = stateApi.reduce(reason, { type: "SUBMIT_STOP_REASON", reason: "skipped" });

  assert.equal(confirm.phase, "stop_confirm");
  assert.equal(reason.phase, "stop_reason");
  assert.equal(reason.guidanceEnded, true);
  assert.equal(stopped.phase, "stopped");
  assert.equal(stopped.stopReason, "skipped");
  assert.equal(stopped.revealReason, null);
});

test("low-confidence and recomputing states never expose a bearing", () => {
  const recovery = stateApi.reduce(followingState(), { type: "LOW_CONFIDENCE", reason: "heading" });
  const recomputing = stateApi.reduce(recovery, { type: "RETRY_GUIDANCE" });
  assert.equal(stateApi.toPublicView(recovery).bearingDeg, null);
  assert.equal(stateApi.toPublicView(recomputing).bearingDeg, null);
});

test("external map requires disclosure warning from route recovery", () => {
  const recovery = stateApi.reduce(followingState(), { type: "LOW_CONFIDENCE", reason: "route" });
  const warning = stateApi.reduce(recovery, { type: "REQUEST_EXTERNAL_MAP" });
  const handoff = stateApi.reduce(warning, { type: "CONFIRM_EXTERNAL_MAP" });
  assert.equal(warning.phase, "external_map_warning");
  assert.equal(warning.revealed, false);
  assert.equal(handoff.phase, "external_map_handoff");
  assert.equal(handoff.revealed, true);
});

test("arrival automatically reveals verified arrival details and schedules feedback", () => {
  const arrived = stateApi.reduce(followingState(), { type: "ARRIVE", nowMs: 10_000 });
  const view = stateApi.toPublicView(arrived);
  assert.equal(arrived.phase, "arrived");
  assert.equal(arrived.revealed, true);
  assert.equal(arrived.feedbackEligibleAtMs, 3_610_000);
  assert.equal(view.destination.floorUnit, "2F");
});

test("arrival completion waits for feedback eligibility", () => {
  const arrived = stateApi.reduce(followingState(), { type: "ARRIVE", nowMs: 10_000 });
  const pending = stateApi.reduce(arrived, { type: "FINISH_ARRIVAL" });
  const early = stateApi.reduce(pending, { type: "CHECK_FEEDBACK", nowMs: 3_609_999 });
  const eligible = stateApi.reduce(pending, { type: "CHECK_FEEDBACK", nowMs: 3_610_000 });
  assert.equal(pending.phase, "feedback_pending");
  assert.equal(early.phase, "feedback_pending");
  assert.equal(eligible.phase, "place_reaction");
});

test("walks, guarded recovery, permissions, and feedback actions obey phase guards", () => {
  const following = followingState();
  const near = stateApi.reduce(following, { type: "WALK", distanceM: 100 });
  const arrived = stateApi.reduce(near, { type: "WALK", distanceM: 29, nowMs: 5 });
  const permissionDenied = stateApi.reduce(
    stateApi.reduce(stateApi.createInitialState({ firstUse: false }), { type: "START", constraints: validConstraints() }),
    { type: "PERMISSION_DENIED", context: "finding" },
  );
  const stopReason = stateApi.reduce(
    stateApi.reduce(
      stateApi.reduce(following, { type: "STOP" }),
      { type: "REQUEST_END" },
    ),
    { type: "CONFIRM_END", nowMs: 1_000 },
  );
  const stopped = stateApi.reduce(stopReason, { type: "SUBMIT_STOP_REASON", reason: "safety" });
  const guarded = stateApi.reduce(stopped, { type: "NEW_RECOMMENDATION", nowMs: 300_999 });
  const reaction = stateApi.reduce(
    stateApi.reduce(
      stateApi.reduce(arrived, { type: "FINISH_ARRIVAL" }),
      { type: "CHECK_FEEDBACK", nowMs: 3_600_005 },
    ),
    { type: "REACT", reaction: "love" },
  );

  assert.equal(near.phase, "near");
  assert.equal(arrived.phase, "arrived");
  assert.equal(permissionDenied.phase, "constraints");
  assert.ok(permissionDenied.errors.locationPermission);
  assert.equal(guarded.phase, "constraints");
  assert.equal(guarded.guardedRecovery, true);
  assert.equal(reaction.phase, "complete");
  assert.equal(reaction.reaction, "love");
});

test("formatDistance formats meters and kilometers without inventing a distance", () => {
  assert.equal(stateApi.formatDistance(850), "850 m");
  assert.equal(stateApi.formatDistance(1250), "1.3 km");
  assert.equal(stateApi.formatDistance(null), null);
});

test("revealed identity remains public while guidance recomputes or recovers", () => {
  const revealedGuidance = followingState({ revealed: true });
  const recomputing = stateApi.reduce(revealedGuidance, { type: "LOW_CONFIDENCE", reason: "heading" });
  const recovery = stateApi.reduce(recomputing, { type: "RETRY_GUIDANCE" });

  assert.equal(recomputing.phase, "route_recovery");
  assert.equal(recovery.phase, "recomputing");
  assert.equal(stateApi.toPublicView(recomputing).destination.name, "Hidden restaurant");
  assert.equal(stateApi.toPublicView(recovery).destination.name, "Hidden restaurant");
});

test("guarded recovery preserves Stop reason and requires explicit review before START", () => {
  const stopReason = stateApi.reduce(
    stateApi.reduce(
      stateApi.reduce(followingState(), { type: "STOP" }),
      { type: "REQUEST_END" },
    ),
    { type: "CONFIRM_END", nowMs: 1_000 },
  );
  const stopped = stateApi.reduce(stopReason, { type: "SUBMIT_STOP_REASON", reason: "safety" });
  const guarded = stateApi.reduce(stopped, { type: "NEW_RECOMMENDATION", nowMs: 300_999 });
  const blocked = stateApi.reduce(guarded, { type: "START", constraints: validConstraints() });
  const reviewed = stateApi.reduce(guarded, {
    type: "START", constraints: validConstraints(), recoveryReviewed: true,
  });

  assert.equal(guarded.guardedRecovery, true);
  assert.equal(guarded.recoveryReason, "safety");
  assert.equal(guarded.recoveryReviewed, false);
  assert.equal(blocked.phase, "constraints");
  assert.match(blocked.errors.recoveryReview, /safety/);
  assert.equal(reviewed.phase, "finding");
  assert.equal(reviewed.recoveryReviewed, true);
});

test("recommendation after the five-minute guard starts normally", () => {
  const stopped = stateApi.reduce(
    stateApi.reduce(
      stateApi.reduce(
        stateApi.reduce(followingState(), { type: "STOP" }),
        { type: "REQUEST_END" },
      ),
      { type: "CONFIRM_END", nowMs: 1_000 },
    ),
    { type: "SUBMIT_STOP_REASON", reason: "schedule_change" },
  );
  const normal = stateApi.reduce(stopped, { type: "NEW_RECOMMENDATION", nowMs: 301_000 });
  const finding = stateApi.reduce(normal, { type: "START", constraints: validConstraints() });

  assert.equal(normal.guardedRecovery, false);
  assert.equal(normal.recoveryReason, null);
  assert.equal(finding.phase, "finding");
});

test("public view publishes an explicit needle mode for trusted, searching, and paused guidance", () => {
  const following = followingState();
  const recovery = stateApi.reduce(following, { type: "LOW_CONFIDENCE", reason: "heading" });
  const recomputing = stateApi.reduce(recovery, { type: "RETRY_GUIDANCE" });
  const paused = stateApi.reduce(following, { type: "STOP" });
  const confirmedStop = stateApi.reduce(
    stateApi.reduce(paused, { type: "REQUEST_END" }),
    { type: "CONFIRM_END", nowMs: 1_000 },
  );

  assert.equal(stateApi.toPublicView(following).needleMode, "pointing");
  assert.equal(stateApi.toPublicView(recovery).bearingDeg, null);
  assert.equal(stateApi.toPublicView(recovery).needleMode, "searching");
  assert.equal(stateApi.toPublicView(recomputing).bearingDeg, null);
  assert.equal(stateApi.toPublicView(recomputing).needleMode, "searching");
  assert.equal(stateApi.toPublicView(paused).needleMode, "paused");
  assert.equal(stateApi.toPublicView(confirmedStop).needleMode, "paused");
});

test("a missing bearing cannot claim a pointing needle", () => {
  const finding = stateApi.reduce(
    stateApi.createInitialState({ firstUse: false }),
    { type: "START", constraints: validConstraints() },
  );
  const following = stateApi.reduce(finding, {
    type: "FIND_SUCCESS",
    destination: { id: "fixture-2", name: "Hidden cafe" },
    route: { id: "route-2", distanceM: 850 },
  });
  const view = stateApi.toPublicView(following);

  assert.equal(view.bearingDeg, null);
  assert.equal(view.needleMode, "searching");
});
