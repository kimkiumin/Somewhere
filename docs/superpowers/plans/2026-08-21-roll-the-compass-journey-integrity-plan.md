# Roll the compass! Journey Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the native compass pivot and motion, enforce Stop-first reveal behavior across the V1 wire contract and server aggregate, make guarded replacement exclude the actual previous venue, and verify the complete iPhone journey with automated, Worker-backed, and visual evidence.

**Architecture:** Keep the existing SwiftUI, TypeScript/Vite, Cloudflare Worker, D1, and Durable Object boundaries. Correct the shared projection contract in place, make the server own reveal/recovery legality, compute selected-member identity once in the provider pool layer, and keep the compass geometry/motion policy pure and unit-testable.

**Tech Stack:** Swift 6, SwiftUI, Core Location, XCTest/XCUITest, TypeScript, Zod, Vitest, Bun, Cloudflare Worker/D1/Durable Objects, XcodeGen, XcodeBuildMCP, iOS 26.5 Simulator.

**Spec:** `docs/superpowers/specs/2026-08-21-roll-the-compass-journey-integrity-design.md`

## Global Constraints

- Keep the product mobile-only and restaurant-only in the native surface; retain the legacy `cafe` contract only for historical evidence.
- Hide destination identity until arrival or a paused/stopped/completed safety path; active unrevealed projections never advertise `reveal`.
- Keep active revealed variants valid only as the result of an authorized safety reveal followed by Continue; they never advertise another Reveal action.
- Accept `external-map` as a route-recovery command only from `paused`; arrival/stopped/completed handoff remains available after identity is already revealed.
- Compute `SHA-256(canonicalId + NUL + candidateId + NUL + snapshotVersion)` through one provider identity helper.
- Exclude the prior member before sealing the qualified pool; an empty post-exclusion restaurant pool returns `no_fit`.
- Preserve unbiased uint32 rejection sampling over the remaining frozen pool; do not add popularity, ratings, reviews, sponsorship, or engagement ranking.
- Keep dietary/allergy unknown evidence fail-closed and do not invent opening-hours, capacity, accessibility, exact-price, or cross-contamination facts.
- Use the current antique compass assets; do not replace them with a screenshot, hand-drawn SVG, map, or generated canvas.
- Keep Release sensor behavior on Core Location `CLHeading`; deterministic course heading remains Debug-only.
- Keep controls at least 44 pt, retain stable accessibility identifiers, support Dynamic Type exit paths, and honor Reduce Motion.
- Edit `ios/project.yml` only when target membership changes; regenerate the generated Xcode project after project-file changes.
- Do not add live or paid provider credentials, Apple signing material, TestFlight configuration, raw locations, or participant data.

---

## File Map

| Unit | Files | Responsibility |
| --- | --- | --- |
| Public projection contract | `contracts/src/journey.ts`, `contracts/src/index.ts`, `contracts/test/contracts.test.ts` | Encode exact action tuples and remove unrevealed active Reveal variants. |
| Native wire validation | `ios/Somewhere/Domain/JourneyProjection.swift`, `ios/Fixtures/projection-examples-v1.json`, `ios/SomewhereTests/JourneyStoreTests.swift`, `ios/SomewhereTests/WireContractTests.swift` | Decode the same matrix and provide deterministic fixtures for UI tests. |
| Server lifecycle authority | `server/src/journey/aggregate.ts`, `server/src/api/journey-lifecycle-prediction.ts`, `server/src/api/journey-projection.ts`, `server/test/lifecycle-transition.test.ts`, `server/test/journey-reveal-safety.test.ts` | Enforce legal Reveal and external-map transitions and project exact actions. |
| Provider identity and recovery | `server/src/provider/pool.ts`, `server/src/provider/selection.ts`, `server/src/api/journey-composition.ts`, `server/src/api/journey-create.ts`, `server/src/api/journey-recovery-digest.ts`, `server/src/api/journey-lifecycle-mutation.ts` | Resolve old guards, persist the real selected digest, and exclude before pool seal. |
| Recovery regression tests | `server/test/selection-receipt-todo7.test.ts`, `server/test/hidden-slice.test.ts`, `server/test/journey-recovery-digest.test.ts`, `server/test/confirm-stop-replay-repair.test.ts` | Prove no same-venue recovery, legacy digest repair, replay safety, and no-fit behavior. |
| Native compass | `ios/Somewhere/UI/SomewhereCompass.swift`, `ios/SomewhereTests/SomewhereCompassTests.swift` | Correct the measured hub offset and shortest-angle animation. |
| Native copy and demo truth | `ios/Somewhere/UI/StopConfirmationView.swift`, `ios/Somewhere/UI/RevealView.swift`, `ios/Somewhere/UI/ArrivalView.swift`, `ios/Somewhere/UI/JourneyReasonViews.swift`, `ios/Somewhere/UI/RecoveryView.swift`, `ios/Somewhere/UI/CompassView.swift`, `ios/Somewhere/App/SomewhereApp.swift` | Remove English/debug artifacts, keep external-map behind Stop, and use reviewed fixture identity. |
| Native UI/E2E evidence | `ios/SomewhereUITests/JourneyFlowUITests.swift`, `ios/SomewhereUITests/VirtualFieldFlowUITests.swift`, `docs/operations/native-ios-collaboration-handoff.md` | Exercise safety flow and record reproducible Mac/Simulator verification. |

---

### Task 1: Correct the shared V1 projection and deterministic fixtures

**Files:**
- Modify: `contracts/src/journey.ts`
- Modify: `contracts/src/index.ts`
- Test: `contracts/test/contracts.test.ts`
- Modify: `ios/Somewhere/Domain/JourneyProjection.swift`
- Modify: `ios/Fixtures/projection-examples-v1.json`
- Modify: `ios/Somewhere/App/SomewhereApp.swift`
- Test: `ios/SomewhereTests/JourneyStoreTests.swift`
- Test: `ios/SomewhereTests/WireContractTests.swift`

**Interfaces:**
- Consumes: Existing `JourneyProjectionV1Schema`, `JourneyProjection.validateContract()`, and the 22-entry fixture catalog.
- Produces: A V1 projection catalog in which active unrevealed phases omit `.reveal`, `arrived` is always revealed, and paused/stopped/completed safety reveal remains available.

- [ ] **Step 1: Write the failing contract assertions**

In `contracts/test/contracts.test.ts`, add a projection matrix test using the existing `JourneyProjectionV1Schema` examples. Assert these exact unrevealed action tuples:

```ts
const fixtures = contractDocumentV1.projectionExamples;
const unrevealed = (phase: string) =>
  fixtures.find((value) => value.phase === phase && value.revealed === false);

expect(unrevealed("ready")?.actions).toEqual(["commit", "stop"]);
expect(unrevealed("committed")?.actions).toEqual(["poll", "stop"]);
expect(unrevealed("following")?.actions).toEqual(["stop", "route-recover", "arrival"]);
expect(unrevealed("route-recovery")?.actions).toEqual(["stop", "route-recover"]);
expect(unrevealed("near")?.actions).toEqual(["stop", "route-recover", "arrival"]);
expect(unrevealed("paused")?.actions).toContain("reveal");
expect(unrevealed("stopped")?.actions).toContain("reveal");
expect(unrevealed("completed")?.actions).toContain("reveal");
expect(unrevealed("arrived")).toBeUndefined();
```

Add a negative parse case that takes the existing following-unrevealed fixture, inserts `"reveal"` at the head of `actions`, and expects `JourneyProjectionV1Schema.safeParse(value).success` to be `false`.

- [ ] **Step 2: Run the focused contract test and verify it fails**

Run:

```sh
bun run --cwd contracts test -- contracts/test/contracts.test.ts
```

Expected: FAIL because the current tuples still contain active `reveal` and the current catalog still accepts unrevealed arrival.

- [ ] **Step 3: Update Zod projection variants**

In `contracts/src/journey.ts`, update the unrevealed variants:

```ts
const ReadyR0Schema = unrevealedSelected({
  phase: z.literal("ready"),
  actions: z.tuple([z.literal("commit"), z.literal("stop")]),
});
const CommittedR0Schema = unrevealedSelected({
  phase: z.literal("committed"),
  pollAfterSeconds: z.number().int().min(1).max(3),
  guidance: RoutePendingGuidanceV1Schema,
  actions: z.tuple([z.literal("poll"), z.literal("stop")]),
});
const FollowingR0Schema = unrevealedSelected({
  phase: z.literal("following"),
  guidance: RouteGuidanceV1Schema,
  actions: z.tuple([z.literal("stop"), z.literal("route-recover"), z.literal("arrival")]),
});
const RouteRecoveryR0Schema = unrevealedSelected({
  phase: z.literal("route-recovery"),
  guidance: GuidanceUnavailableV1Schema,
  actions: z.tuple([z.literal("stop"), z.literal("route-recover")]),
});
const NearR0Schema = unrevealedSelected({
  phase: z.literal("near"),
  guidance: RouteGuidanceV1Schema,
  actions: z.tuple([z.literal("stop"), z.literal("route-recover"), z.literal("arrival")]),
});
```

Delete `ArrivedR0Schema` and remove it from `JourneyProjectionV1Schema`. Keep all revealed active variants because they can be reached only after paused safety Reveal and Continue. Keep the HTTP endpoint catalog unchanged; the endpoint remains needed for legal safety states.

Update the representative projection examples in `contracts/src/index.ts` to match the exact tuples and remove the unrevealed arrived example.

- [ ] **Step 4: Update native validation and fixture data**

In `ios/Somewhere/Domain/JourneyProjection.swift`, make `validateContract()` use the same arrays:

```swift
case (.ready, false?, _): expected = [.commit, .stop]
case (.committed, false?, _): expected = [.poll, .stop]
case (.following, false?, _), (.near, false?, _): expected = [.stop, .routeRecover, .arrival]
case (.routeRecovery, false?, _): expected = [.stop, .routeRecover]
case (.arrived, true?, _): expected = []
```

Remove the `(.arrived, false?, _)` branch so an unrevealed arrival throws `ProjectionContractError.invalidPhasePayload`. Edit `ios/Fixtures/projection-examples-v1.json` by removing only the unrevealed arrived object and removing `reveal` from ready, committed, following, route-recovery, and near unrevealed objects. Keep the revealed counterparts.

Update `UITestProjectionFactory` in `ios/Somewhere/App/SomewhereApp.swift` with the same actions. Remove the `arrived-unrevealed` case. Change the Debug disclosure from `"cafe"` to `"restaurant"` and use the reviewed Korean category `"한식 국물 요리"`.

- [ ] **Step 5: Update native tests for the new contract**

Change `testFollowingStartsGuidanceState` to assert `.stop` is present and `.reveal` is absent. Add:

```swift
func testActiveUnrevealedProjectionCannotAdvertiseReveal() throws {
    for phase in ["ready", "committed", "following", "route-recovery", "near"] {
        let value = try projection(phase: phase, revealed: false)
        XCTAssertFalse(value.actions.contains(.reveal), phase)
    }
}

func testPausedSafetyRevealRemainsAvailable() throws {
    let value = try projection(phase: "paused", revealed: false)
    XCTAssertTrue(value.actions.contains(.reveal))
}
```

Change both the contract fixture count assertion and the native wire fixture count assertion from 22 to 21. Add a test that decoding a JSON object with `phase: "arrived"`, `revealed: false`, and `actions: ["reveal"]` throws.

- [ ] **Step 6: Run the focused contract and native unit tests**

Run:

```sh
bun run --cwd contracts test
xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:SomewhereTests/JourneyStoreTests -only-testing:SomewhereTests/WireContractTests CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid
```

Expected: PASS with no unrevealed active Reveal action and no unrevealed arrived fixture.

- [ ] **Step 7: Commit the contract slice**

```sh
git add contracts/src/journey.ts contracts/src/index.ts contracts/test/contracts.test.ts ios/Somewhere/Domain/JourneyProjection.swift ios/Fixtures/projection-examples-v1.json ios/Somewhere/App/SomewhereApp.swift ios/SomewhereTests/JourneyStoreTests.swift ios/SomewhereTests/WireContractTests.swift
git commit -m "fix: remove active reveal from journey contract"
```

### Task 2: Enforce Reveal and external-map safety in the server lifecycle

**Files:**
- Modify: `server/src/journey/aggregate.ts`
- Modify: `server/src/api/journey-lifecycle-prediction.ts`
- Modify: `server/src/api/journey-projection.ts`
- Test: `server/test/journey-reveal-safety.test.ts`
- Modify: `server/test/lifecycle-transition.test.ts`

**Interfaces:**
- Consumes: `JourneyCommand`, `JourneyState`, `LifecycleSnapshot`, and the corrected contract tuples from Task 1.
- Produces: `transitionJourney()` rejects active `reveal` and active `external-map`; `projectLifecycleJourney()` emits the exact legal action tuple for every phase.

- [ ] **Step 1: Write the failing lifecycle tests**

Create `server/test/journey-reveal-safety.test.ts` with a `stateFor(phase)` helper that constructs the existing `JourneyState` shapes used in `server/test/lifecycle-transition.test.ts`. Add these assertions:

```ts
it.each(["ready", "committed", "following", "route-recovery", "near"] as const)(
  "rejects direct Reveal from %s",
  (phase) => {
    const state = stateFor(phase);
    const result = transitionJourney(state, command("reveal", state.sequence));
    expect(result.kind).toBe("illegal_transition");
    expect(result.state).toEqual(state);
    expect(result.outbox).toEqual([]);
  },
);

it("allows safety Reveal while paused and Continue keeps the identity disclosed", () => {
  const paused = stateFor("paused");
  const revealed = transitionJourney(paused, command("reveal", paused.sequence));
  const continued = transitionJourney(revealed.state, command("continue", revealed.state.sequence));
  expect(revealed.kind).toBe("applied");
  expect(revealed.state.phase).toBe("paused");
  expect(revealed.state.revealed).toBe(true);
  expect(continued.kind).toBe("applied");
  expect(continued.state.phase).toBe("following");
  expect(continued.state.revealed).toBe(true);
});

it("rejects external-map recovery before Stop and accepts it while paused", () => {
  const following = stateFor("following");
  const active = transitionJourney(following, command("external-map", following.sequence));
  expect(active.kind).toBe("illegal_transition");

  const paused = stateFor("paused");
  const pausedMap = transitionJourney(paused, command("external-map", paused.sequence));
  expect(pausedMap.kind).toBe("applied");
  expect(pausedMap.state.routeRepair).toEqual({ status: "external-map-handed-off" });
  expect(pausedMap.state.revealed).toBe(true);
});
```

Use `command("external-map", ...)` to create `{ type: "route-recover", choice: "external-map", ... }` and use the existing deterministic command digest fields.

- [ ] **Step 2: Run the focused server tests and verify they fail**

Run:

```sh
bun run --cwd server test -- server/test/journey-reveal-safety.test.ts server/test/lifecycle-transition.test.ts
```

Expected: FAIL because active Reveal and active external-map are currently accepted.

- [ ] **Step 3: Guard the aggregate transitions**

In `server/src/journey/aggregate.ts`, before the terminal-phase branch, reject a Reveal command unless the phase is `paused`, `stopped`, or `completed`:

```ts
if (
  command.type === "reveal" &&
  state.phase !== "paused" &&
  state.phase !== "stopped" &&
  state.phase !== "completed"
) {
  return unchanged(state, "illegal_transition");
}
```

Inside `case "route-recover"`, reject `external-map` unless `state.phase === "paused"` before applying the current branch. Preserve recalibrate, reroute, and cached-route behavior for active route recovery. Preserve the existing paused handoff status and reveal flag.

- [ ] **Step 4: Make prediction and projection agree with aggregate legality**

In `server/src/api/journey-lifecycle-prediction.ts`, make `case "reveal"` set `revealed: true` only for `paused`, `stopped`, or `completed`; for other phases return `next` unchanged. This prevents the HTTP response-building path from predicting a state the aggregate will reject.

In `server/src/api/journey-projection.ts`, replace the global `canReveal` with phase-local action construction:

```ts
case "ready":
  projection = { ...selected, actions: ["commit", "stop"], phase: "ready" };
  break;
case "committed":
  projection = { ...selected, actions: ["poll", "stop"], guidance: { kind: "unavailable", reason: "route-pending" }, phase: "committed", pollAfterSeconds: 1 };
  break;
case "following":
case "near":
  projection = { ...selected, actions: ["stop", "route-recover", "arrival"], guidance: routeGuidance(prepared), phase: snapshot.phase };
  break;
case "route-recovery":
  projection = { ...selected, actions: ["stop", "route-recover"], guidance: { kind: "unavailable", reason: routeFailure(snapshot.routeRepair) }, phase: "route-recovery" };
  break;
```

Keep Reveal in unrevealed paused, stopped, and completed projections. Keep revealed active variants without Reveal so a paused safety reveal followed by Continue remains representable.

- [ ] **Step 5: Update exhaustive lifecycle expectations**

In `server/test/lifecycle-transition.test.ts`, change `ALLOWED` to:

```ts
const ALLOWED = {
  arrived: [],
  committed: ["stop-request"],
  completed: ["reveal", "recovery-intent", "recovery-confirm"],
  following: ["stop-request", "route-recover", "arrival"],
  near: ["stop-request", "route-recover", "arrival"],
  paused: ["reveal", "continue", "confirm-stop", "route-recover"],
  ready: ["commit", "stop-request"],
  "route-recovery": ["stop-request", "route-recover"],
  stopped: ["reveal", "stop-reason"],
} as const satisfies Readonly<Record<JourneyState["phase"], readonly PublicAction[]>>;
```

Update the projection expectation to assert the exact unrevealed arrays and add a revealed paused state that projects `reveal: prepared.identity` with no `reveal` action.

- [ ] **Step 6: Run the server lifecycle slice**

Run:

```sh
bun run --cwd server test -- server/test/journey-reveal-safety.test.ts server/test/lifecycle-transition.test.ts server/test/journey-schema-contract.test.ts
```

Expected: PASS with active direct Reveal and active external-map rejected.

- [ ] **Step 7: Commit the lifecycle slice**

```sh
git add server/src/journey/aggregate.ts server/src/api/journey-lifecycle-prediction.ts server/src/api/journey-projection.ts server/test/journey-reveal-safety.test.ts server/test/lifecycle-transition.test.ts
git commit -m "fix: enforce stop-first reveal transitions"
```

### Task 3: Make recovery exclude the actual selected member

**Files:**
- Modify: `server/src/provider/pool.ts`
- Modify: `server/src/provider/selection.ts`
- Modify: `server/src/api/journey-composition.ts`
- Create: `server/src/api/journey-recovery-digest.ts`
- Modify: `server/src/api/journey-create.ts`
- Modify: `server/src/api/journey-lifecycle-mutation.ts`
- Test: `server/test/journey-recovery-digest.test.ts`
- Test: `server/test/hidden-slice.test.ts`
- Test: `server/test/selection-receipt-todo7.test.ts`
- Test: `server/test/confirm-stop-replay-repair.test.ts`

**Interfaces:**
- Consumes: `PoolMember`, `SealedPool`, the retained D1 `selection_receipts` columns, `PreparedJourney.receipt.selectedMemberDigest`, and the existing recovery capability guard.
- Produces: `digestMember(member: PoolMember): string`, `resolvePreviousMemberDigest(database, guardDigest): Promise<string>`, and `buildJourneyPreparation({ previousMemberDigest? })` that returns `no_fit` when the prior member cannot safely be excluded.

- [ ] **Step 1: Write the digest and recovery failing tests**

Create `server/test/journey-recovery-digest.test.ts` with a migrated SQLite D1 fixture. Insert one `selection_receipts` row where `randomness_digest = "a".repeat(64)` and `selected_member_digest = "b".repeat(64)`. Assert:

```ts
expect(await resolvePreviousMemberDigest(database, "a".repeat(64))).toBe("b".repeat(64));
expect(await resolvePreviousMemberDigest(database, "c".repeat(64))).toBe("c".repeat(64));
```

In `server/test/hidden-slice.test.ts`, prepare the reviewed restaurant once, then prepare again with `previousMemberDigest: first.receipt.selectedMemberDigest` and assert `{ kind: "error", code: "no_fit" }` because the current restaurant-only fixture has one eligible restaurant.

In `server/test/selection-receipt-todo7.test.ts`, replace the low-level `previousCandidateId` input with a pool that already contains the intended remaining members. Assert the draw never sees the removed member and the receipt `qualifiedPoolSize` equals the sealed remaining pool size. Add a `digestMember` assertion using the exact canonical string formula.

- [ ] **Step 2: Run the focused recovery tests and verify they fail**

Run:

```sh
bun run --cwd server test -- server/test/journey-recovery-digest.test.ts server/test/hidden-slice.test.ts server/test/selection-receipt-todo7.test.ts
```

Expected: FAIL because the recovery input is not accepted by composition, the low-level selection still filters by candidate ID after pool seal, and no receipt-digest resolver exists.

- [ ] **Step 3: Centralize member digest computation**

In `server/src/provider/pool.ts`, add:

```ts
export function digestMember(member: PoolMember): string {
  return digest(
    member.canonicalId + "\\0" + member.candidateId + "\\0" + member.snapshotVersion,
  );
}

export function digestMembers(members: readonly PoolMember[]): string {
  return digest(members.map(digestMember).join("\\n"));
}
```

The returned value remains `sha256:<hex>` for pool digests. In `journey-composition.ts`, derive the receipt's `selectedMemberDigest` by removing the `sha256:` prefix from `digestMember(selected.member)` so it continues to match the D1 `length = 64` digest column.

- [ ] **Step 4: Remove post-seal previous-candidate filtering**

Change `selectDestination()` in `server/src/provider/selection.ts` to draw directly from `input.pool.members`. Remove `previousCandidateId` from its input type and update all callers and tests. The function continues to revalidate, record attempts, and remove failed members only after each failed final validation.

In `buildJourneyPreparation()`:

```ts
const qualified = evidence.qualified.filter((candidate) => {
  if (!hardEligibleCandidateIds.has(candidate.candidateId)) return false;
  const route = ROUTES_BY_CANDIDATE.get(candidate.candidateId);
  return route !== undefined && route.expectedDurationSeconds <= durationLimitSeconds;
});

const eligibleAfterRecovery = input.previousMemberDigest === undefined
  ? qualified
  : qualified.filter((member) => digestMember(member).slice(7) !== input.previousMemberDigest);

if (eligibleAfterRecovery.length === 0) return { code: "no_fit", kind: "error" };
const pool = sealPool({ bundle: FIXTURE, qualified: eligibleAfterRecovery });
```

Before filtering, if the supplied digest does not match exactly one member in `CANDIDATES`, return `no_fit`. If it matches a current candidate that is already absent from `qualified`, the filtered pool is unchanged and remains valid because that destination is already ineligible.

Add `previousMemberDigest?: string` to the `buildJourneyPreparation` input type. Do not send it to the client or store it in `SelectedSnapshot`.

- [ ] **Step 5: Resolve legacy receipt guards before preparation**

Create `server/src/api/journey-recovery-digest.ts`:

```ts
export async function resolvePreviousMemberDigest(
  database: D1Database,
  guardDigest: string,
): Promise<string> {
  const row = await database
    .prepare(
      "SELECT selected_member_digest FROM selection_receipts WHERE randomness_digest = ? AND selected_member_digest IS NOT NULL ORDER BY expires_at DESC LIMIT 1",
    )
    .bind(guardDigest)
    .first();
  return isSha256Hex(row?.selected_member_digest) ? row.selected_member_digest : guardDigest;
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
```

Implement `isSha256Hex` in the same file as a type guard for exactly 64 lowercase hexadecimal characters. A retained `randomness_digest` is authoritative for the old buggy guard. A guard with no matching receipt is treated as a current member digest and is validated against the current candidate set in composition.

In `createJourney()`, when `recoveryCapability !== null`, require a non-null `guard.previous_candidate_digest`, resolve it through `resolvePreviousMemberDigest`, and pass it as `previousMemberDigest` to `createReservedJourney()` and then `buildJourneyPreparation()`. If the digest cannot match one current candidate, return public `no_fit` after capability validation and before persistence.

- [ ] **Step 6: Store the selected-member digest on confirmed Stop**

In `server/src/api/journey-lifecycle-mutation.ts`, replace:

```ts
previousCandidateDigest:
  snapshot.selectedSnapshot.receiptDigest ??
  (await hmacDigest(dependencies.hmacKey, snapshot.selectedSnapshot.selectionReceiptId)),
```

with:

```ts
previousCandidateDigest: prepared.receipt.selectedMemberDigest,
```

The prepared payload is already decrypted and parsed for the mutation response, so no identity is added to the durable object snapshot or public projection.

Update `server/test/confirm-stop-replay-repair.test.ts` to assert the guard stores `journey.receipt.selectedMemberDigest`, not `journey.receipt.receiptDigest`, after the replay repair. Keep the D1 write-failure and exact response replay assertions.

- [ ] **Step 7: Run all recovery and selection tests**

Run:

```sh
bun run --cwd server test -- server/test/journey-recovery-digest.test.ts server/test/hidden-slice.test.ts server/test/selection-receipt-todo7.test.ts server/test/confirm-stop-replay-repair.test.ts server/test/journey-persistence-guards.test.ts
```

Expected: PASS; the Seoul Forest restaurant-only replacement returns `no_fit`, old receipt-digest guards resolve safely, current selected-member guards work, and confirm-stop stores the selected member digest.

- [ ] **Step 8: Commit the recovery slice**

```sh
git add server/src/provider/pool.ts server/src/provider/selection.ts server/src/api/journey-composition.ts server/src/api/journey-recovery-digest.ts server/src/api/journey-create.ts server/src/api/journey-lifecycle-mutation.ts server/test/journey-recovery-digest.test.ts server/test/hidden-slice.test.ts server/test/selection-receipt-todo7.test.ts server/test/confirm-stop-replay-repair.test.ts
git commit -m "fix: exclude the previous destination during recovery"
```

### Task 4: Correct the compass pivot and shortest-angle motion

**Files:**
- Modify: `ios/Somewhere/UI/SomewhereCompass.swift`
- Create: `ios/SomewhereTests/SomewhereCompassTests.swift`

**Interfaces:**
- Consumes: `SomewhereCompassMode`, the 1254 × 1254 `RollCompassNeedle` asset, and SwiftUI Reduce Motion environment.
- Produces: `SomewhereCompassMotionPolicy.shortestSignedDelta(from:to:)`, `SomewhereCompassMotionPolicy.unwrappedTarget(from:to:)`, and `SomewhereCompassMotionPolicy.hubCorrection(displaySize:frameScale:)` for the view and tests.

- [ ] **Step 1: Write failing pure geometry and motion tests**

Create `ios/SomewhereTests/SomewhereCompassTests.swift`:

```swift
import XCTest
@testable import Somewhere

final class SomewhereCompassTests: XCTestCase {
    func testHubCorrectionMovesMeasuredHubToTheRotationCenter() {
        let correction = SomewhereCompassMotionPolicy.hubCorrection(displaySize: 286, frameScale: 0.68)
        XCTAssertEqual(correction.width, -0.08, accuracy: 0.02)
        XCTAssertEqual(correction.height, -14.12, accuracy: 0.05)
    }

    func testShortestDeltaCrossesNorthClockwise() {
        XCTAssertEqual(SomewhereCompassMotionPolicy.shortestSignedDelta(from: 359, to: 1), 2, accuracy: 0.001)
        XCTAssertEqual(SomewhereCompassMotionPolicy.unwrappedTarget(from: 359, to: 1), 361, accuracy: 0.001)
    }

    func testShortestDeltaCrossesNorthCounterClockwise() {
        XCTAssertEqual(SomewhereCompassMotionPolicy.shortestSignedDelta(from: 1, to: 359), -2, accuracy: 0.001)
        XCTAssertEqual(SomewhereCompassMotionPolicy.unwrappedTarget(from: 1, to: 359), -1, accuracy: 0.001)
    }

    func testOppositeAnglesUseAStableBoundedDelta() {
        let delta = SomewhereCompassMotionPolicy.shortestSignedDelta(from: 170, to: -170)
        XCTAssertEqual(abs(delta), 20, accuracy: 0.001)
    }
}
```

The width assertion reflects the measured hub x-coordinate `627.5` versus pivot `627`; the height assertion reflects `(627 - 718) * (286 * 0.68 / 1254)`.

- [ ] **Step 2: Run the focused native test and verify it fails**

Run:

```sh
xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:SomewhereTests/SomewhereCompassTests CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid
```

Expected: FAIL because the policy does not yet expose geometry or shortest-angle functions.

- [ ] **Step 3: Add the tested motion and geometry policy**

In `SomewhereCompassMotionPolicy`, add:

```swift
static func shortestSignedDelta(from current: Double, to next: Double) -> Double {
    let raw = (next - current).truncatingRemainder(dividingBy: 360)
    if raw > 180 { return raw - 360 }
    if raw < -180 { return raw + 360 }
    return raw
}

static func unwrappedTarget(from current: Double, to next: Double) -> Double {
    current + shortestSignedDelta(from: current, to: next)
}

static func hubCorrection(displaySize: CGFloat, frameScale: CGFloat) -> CGSize {
    let sourceScale = displaySize * frameScale / 1254
    return CGSize(width: (627 - 627.5) * sourceScale, height: (627 - 718) * sourceScale)
}
```

Keep the functions internal so XCTest can validate them without making them public API.

- [ ] **Step 4: Render the corrected centered rotation container**

Replace the direct rotating `Image("RollCompassNeedle")` in `SomewhereCompass` with a centered container:

```swift
private let needleFrameScale: CGFloat = 0.68

private var needleLayer: some View {
    ZStack {
        Image("RollCompassNeedle")
            .resizable()
            .interpolation(.high)
            .antialiased(true)
            .scaledToFit()
            .frame(width: size * needleFrameScale, height: size * needleFrameScale)
            .offset(SomewhereCompassMotionPolicy.hubCorrection(displaySize: size, frameScale: needleFrameScale))
    }
    .frame(width: size, height: size)
    .rotationEffect(.degrees(needleAngle))
    .scaleEffect(needlePulse ? 1.025 : 0.985)
}
```

Apply paused grayscale, opacity, shadow, animation, and accessibility-hidden modifiers to `needleLayer`. Keep the shell in its own centered image layer.

- [ ] **Step 5: Use an unwrapped target in `syncMotion`**

Rename `animatedBearing` to `animatedNeedleTarget`. In pointing mode, normalize the incoming Core Location bearing only for accessibility text, then update the state with the shortest unwrapped target:

```swift
let target = SomewhereCompassMotionPolicy.unwrappedTarget(
    from: animatedNeedleTarget,
    to: bearing,
)
withAnimation(.spring(response: 0.42, dampingFraction: 0.76)) {
    animatedNeedleTarget = target
}
```

When Reduce Motion is enabled, set the same unwrapped target without animation and disable `needlePulse`. Keep searching rotation disabled under Reduce Motion and keep paused mode on the last target.

- [ ] **Step 6: Run native unit tests and inspect same-viewport captures**

Run the focused tests again, then launch the Debug states `following` and `following-revealed` on the iPhone 17 Pro Simulator. Capture 368 × 800 screenshots and inspect that the gold hub stays centered at 0°, 90°, 180°, and 270°; inspect a north-crossing frame sequence for `359° → 1°`.

- [ ] **Step 7: Commit the compass slice**

```sh
git add ios/Somewhere/UI/SomewhereCompass.swift ios/SomewhereTests/SomewhereCompassTests.swift
git commit -m "fix: center compass needle rotation"
```

### Task 5: Polish native copy, demo truth, and paused map handoff

**Files:**
- Modify: `ios/Somewhere/UI/StopConfirmationView.swift`
- Modify: `ios/Somewhere/UI/RevealView.swift`
- Modify: `ios/Somewhere/UI/ArrivalView.swift`
- Modify: `ios/Somewhere/UI/JourneyReasonViews.swift`
- Modify: `ios/Somewhere/UI/RecoveryView.swift`
- Modify: `ios/Somewhere/UI/CompassView.swift`
- Modify: `ios/Somewhere/App/SomewhereApp.swift`
- Test: `ios/SomewhereUITests/JourneyFlowUITests.swift`

**Interfaces:**
- Consumes: Corrected projection actions, `JourneyStore` Stop/reveal/external-map commands, current palette/assets, and the reviewed Seoul Forest restaurant fixture.
- Produces: Korean user-facing copy, no active unrevealed external-map handoff, a paused external-map button, truthful Debug arrival identity, and decorative fallback artwork with no false photo label.

- [ ] **Step 1: Write failing UI assertions for copy and map placement**

In `JourneyFlowUITests.swift`, update the harness tests:

```swift
func testRouteRecoveryRequiresStopBeforeExternalMap() {
    let app = launchHarness("route-recovery")
    XCTAssertTrue(app.buttons["somewhere.stop"].waitForExistence(timeout: 2))
    XCTAssertFalse(app.buttons["somewhere.external-map"].exists)
}

func testPausedStopSheetOffersExternalMapWarning() {
    let app = launchHarness("following")
    app.buttons["somewhere.stop"].tap()
    let map = app.buttons["somewhere.paused-external-map"]
    XCTAssertTrue(map.waitForExistence(timeout: 2))
    map.tap()
    XCTAssertTrue(app.buttons["somewhere.external-map-confirm"].waitForExistence(timeout: 2))
}

func testKoreanSafetyAndArrivalLabelsAreUsed() {
    let paused = launchHarness("following")
    paused.buttons["somewhere.stop"].tap()
    XCTAssertTrue(paused.staticTexts["안전 일시정지"].waitForExistence(timeout: 2))
    let arrived = launchHarness("arrived-rich")
    XCTAssertTrue(arrived.staticTexts["목적지 발견"].waitForExistence(timeout: 2))
    XCTAssertFalse(arrived.staticTexts["DESTINATION FOUND"].exists)
}
```

Update `testRichArrivalHierarchyIsRendered` to assert `소문난성수감자탕` and `서울특별시 성동구 연무장길 45` rather than the synthetic building, floor, and review text.

- [ ] **Step 2: Run the focused UI tests and verify they fail**

Run with XcodeBuildMCP on the active iPhone 17 Pro Simulator:

```text
test_sim(scheme: "Somewhere", extraArgs: ["CODE_SIGNING_ALLOWED=NO", "SOMEWHERE_API_ORIGIN=https://example.invalid"], onlyTesting: ["SomewhereUITests/JourneyFlowUITests"])
```

Expected: FAIL because route recovery still shows the external-map button, the Stop sheet has no paused map button, and English/demo copy is still present.

- [ ] **Step 3: Move external-map entry behind paused Stop**

In `RouteRecoveryView`, remove the external-map button for unrevealed route recovery. In `StopConfirmationView`, add:

```swift
if store.projection?.phase == .paused {
    Button("외부 지도 열기") {
        store.requestExternalMap()
    }
    .buttonStyle(SomewhereSecondaryButtonStyle())
    .accessibilityLabel("외부 지도를 열고 목적지 공개")
    .accessibilityIdentifier("somewhere.paused-external-map")
}
```

Remove the active revealed `외부 지도` action from `CompassView` so the user reaches map handoff through paused safety state or an already-finished/arrived screen. Keep `RecoveryView` and `ArrivalView` handoff buttons because identity is already revealed there.

- [ ] **Step 4: Replace English labels and fallback identity**

Use these exact copy values:

```swift
StopConfirmationView: SomewhereSignalPill(..., title: "안전 일시정지", ...)
ArrivalView: SomewhereSignalPill(..., title: "도착", ...)
RevealView: SomewhereSignalPill(..., title: "목적지 발견", ...)
RevealReasonView: SomewhereSignalPill(..., title: "목적지 확인", ...)
ExternalMapWarningView: SomewhereSignalPill(..., title: "외부 지도", ...)
RecoveryView header: projection.phase == .stopped ? "안전하게 종료됨" : "여정 완료"
```

In `RevealView.photoPlaceholder`, remove the `ROLL THE COMPASS / FOUND` text and set `.accessibilityHidden(true)` on the decorative fallback stack. Keep the compass shell ornament as visual decoration only. The enclosing `RevealView` continues to announce the revealed venue name.

In `UITestProjectionFactory`, set all Debug reveal identities to the reviewed fixture:

```json
{"name":"소문난성수감자탕","address":"서울특별시 성동구 연무장길 45"}
```

Remove synthetic building, floor, and review fields from `arrived-rich`. Keep the recommendation reason only when it is a product-generated route explanation; do not add a fabricated provider review.

- [ ] **Step 5: Keep restaurant-only Debug disclosure and Korean category text**

In the factory's common disclosure, use:

```json
{"representativeCategories":["한식 국물 요리"],"priceBand":"medium"}
```

Keep the production server projection unchanged; localization of a reviewed broad category in the native display must not change selection or evidence policy.

- [ ] **Step 6: Run focused UI tests and accessibility checks**

Run the JourneyFlow UI suite again. Then run the native source/evidence gates:

```sh
bun run verify:ios-source
bun run verify:native-evidence
```

Expected: PASS; active route recovery exposes Stop but no map handoff, paused Stop exposes the warning, Korean copy is visible, and the decorative fallback has no image announcement.

- [ ] **Step 7: Commit the native polish slice**

```sh
git add ios/Somewhere/UI/StopConfirmationView.swift ios/Somewhere/UI/RevealView.swift ios/Somewhere/UI/ArrivalView.swift ios/Somewhere/UI/JourneyReasonViews.swift ios/Somewhere/UI/RecoveryView.swift ios/Somewhere/UI/CompassView.swift ios/Somewhere/App/SomewhereApp.swift ios/SomewhereUITests/JourneyFlowUITests.swift
git commit -m "feat: polish native safety and reveal surfaces"
```

### Task 6: Run full regression, Worker-backed iOS E2E, visual QA, and handoff documentation

**Files:**
- Modify: `ios/SomewhereUITests/VirtualFieldFlowUITests.swift` only if corrected copy/action identifiers require a test update
- Modify: `docs/operations/native-ios-collaboration-handoff.md`
- Create: `.local-artifacts/audit-2026-08-21-final/` through test/capture tooling; do not commit generated media unless explicitly requested

**Interfaces:**
- Consumes: All corrected contract, server, recovery, compass, and native UI slices.
- Produces: Fresh automated pass evidence, a local Worker journey that arrives and reveals, no-fit recovery evidence, same-viewport moodboard comparison captures, updated collaborator runbook, and a clean pushed branch.

- [ ] **Step 1: Regenerate and build the native project**

Run:

```sh
xcodegen generate --spec ios/project.yml
xcodebuild -list -project ios/Somewhere.xcodeproj
xcodebuild build -project ios/Somewhere.xcodeproj -scheme Somewhere -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid
```

Expected: the shared `Somewhere` scheme builds with no project membership drift.

- [ ] **Step 2: Run all JavaScript and contract verification**

Run:

```sh
bun run test:app
bun run test:server
bun run test:contracts
bun run typecheck
bun run lint
bun run verify:blueprint
bun run verify:release-authority
bun audit --audit-level=high
```

Expected: all tests pass, lint reports no errors, release authority remains an explicit environment gate if the Linux-only check is unavailable, and audit reports no known vulnerabilities.

- [ ] **Step 3: Run the complete native Simulator suite**

Use XcodeBuildMCP `test_sim` with scheme `Somewhere`, iPhone 17 Pro Simulator, `CODE_SIGNING_ALLOWED=NO`, and `SOMEWHERE_API_ORIGIN=https://example.invalid`. Run both `SomewhereTests` and `SomewhereUITests`. Record pass/fail/skip counts and retain the result bundle outside Git.

Expected: the previous 47-pass baseline grows by the compass and safety regressions, with no new skip introduced by this change.

- [ ] **Step 4: Run local Worker-backed virtual field E2E**

Terminal A:

```sh
bash scripts/release/local-v2-start-for-qa.sh
```

Terminal B:

```sh
node scripts/ios/local-ios-loopback-proxy.mjs
```

Run the virtual field tests with the loopback origin and environment:

```sh
xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:SomewhereUITests/VirtualFieldFlowUITests CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=http://127.0.0.1:8788
```

Pass `SOMEWHERE_RUN_LOCAL_E2E=1` through the XcodeBuildMCP test runner environment. Verify both restaurant arrival auto-reveal and off-route suppression/recovery. Add a Worker-backed recovery request using the single Seoul Forest restaurant and assert public `no_fit`; never assert a same-destination success.

- [ ] **Step 5: Capture final visual evidence**

Using XcodeBuildMCP on the 368 × 800 iPhone 17 Pro Simulator, capture these states into `.local-artifacts/audit-2026-08-21-final/`:

```text
launch
following at 0°
following after a 359° → 1° heading change
paused
route-recovery
arrived-rich
feedback
```

Compare the final captures with the supplied compass moodboard/reference in one side-by-side review. Check the measured hub remains centered, the needle tip stays inside the bezel, no text is white on the warm canvas, the main guidance hierarchy fits without scrolling, Korean copy is consistent, and the fallback ornament has no false image semantics.

- [ ] **Step 6: Update the collaborator handoff**

In `docs/operations/native-ios-collaboration-handoff.md`, add these final behavior notes:

```text
- Active unrevealed projections do not expose Reveal; Stop opens the safety path.
- External-map handoff is offered after the journey is paused or already revealed.
- Confirmed Stop stores selected_member_digest; legacy randomness_digest guards resolve through selection_receipts.
- Recovery removes the previous member before pool sealing and returns no_fit when no restaurant remains.
- The needle pivot uses the measured artwork hub and unwrapped shortest-angle animation.
```

Add the exact focused test commands and final Simulator/Worker evidence locations. Keep signing, provider rights, legal review, and physical walking accuracy listed as external gates.

- [ ] **Step 7: Review the complete diff and run final gates**

Run:

```sh
git diff --check origin/codex/roll-compass-native-app...HEAD
git status --short
bun run verify:v2
bun run verify:ios-source
bun run verify:native-evidence
```

Inspect that no generated build output, credentials, raw location, or unrelated collaborator changes are staged. If `verify:release` is blocked by its documented Linux-only authority, record it without weakening code or tests.

- [ ] **Step 8: Commit documentation and push the complete branch**

```sh
git add docs/operations/native-ios-collaboration-handoff.md ios/SomewhereUITests/VirtualFieldFlowUITests.swift
git commit -m "docs: record journey integrity verification"
git push origin codex/roll-compass-native-app
git status --short --branch
git rev-parse HEAD
git rev-parse origin/codex/roll-compass-native-app
```

Expected: the worktree is clean and local/remote SHA values are identical.

## Final Verification Matrix

| Requirement | Evidence | Expected result |
| --- | --- | --- |
| Active Reveal safety | `server/test/journey-reveal-safety.test.ts`, contract schema, native decoder, JourneyFlow UI | No active unrevealed Reveal action or legal direct command. |
| Arrival reveal | `lifecycle-transition.test.ts`, `VirtualFieldFlowUITests`, arrival capture | Credible repeated arrival reveals identity automatically. |
| Previous destination exclusion | `journey-recovery-digest.test.ts`, `hidden-slice.test.ts`, Worker recovery request | Legacy/current digest resolves; prior restaurant is excluded; one-member pool returns `no_fit`. |
| Uniform selection | `selection-receipt-todo7.test.ts` | Rejection sampling stays uniform over the frozen remaining pool. |
| Needle geometry | `SomewhereCompassTests.swift`, 0/90/180/270 captures | Hub remains fixed; tip stays within bezel. |
| Shortest motion | north-crossing unit test and frame sequence | `359° → 1°` takes a 2° path, not a 358° spin. |
| Safety handoff | paused Stop UI test and active route-recovery UI test | External map requires paused/revealed safety path. |
| Product copy/accessibility | JourneyFlow UI, source/evidence gates, final captures | Korean labels, 44 pt controls, decorative fallback hidden from accessibility. |
| Release boundary | `verify:ios-source`, `verify:native-evidence`, clean diff review | Debug-only deterministic harness remains out of Release; no credentials or raw traces. |
