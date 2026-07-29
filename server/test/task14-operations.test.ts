import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OPERATIONS_POLICY_V1 } from "../../contracts/src/policy";
import { ProviderRightsRecordV1Schema } from "../../contracts/src/provider";
import { ADMISSION_STATES } from "../src/admission/admission";
import { validateCutoverOrder } from "../src/operations/cutover";
import { operationsHealth } from "../src/operations/health";
import { evaluateKoreaReview, evaluateProviderRights } from "../src/operations/release-gates";
import { evaluateRestore } from "../src/operations/restore";
import { decideRollback } from "../src/operations/rollback";
import { authorizeWrite } from "../src/operations/write-fence";

const SHA = `sha256:${"a".repeat(64)}`;

describe("Task 14 operational safety controls", () => {
  it("uses exactly the frozen nine durable admission states", () => {
    // Given: the runtime state machine and the versioned operations policy.
    const runtimeStates = [...ADMISSION_STATES];

    // When: their durable state vocabularies are compared.
    const policyStates = [...OPERATIONS_POLICY_V1.states];

    // Then: runtime cannot invent a tenth operational state outside the contract.
    expect(runtimeStates).toEqual(policyStates);
  });

  it("preserves terminal safety writes under closed admission at the current epoch", () => {
    // Given: a closed admission fence after an epoch increase.
    const fence = { mode: "ADMISSION_CLOSED" as const, writeEpoch: 8 };

    // When: terminal safety and new-work writes arrive with the previous epoch.
    const safety = authorizeWrite(fence, "SAFETY_SERVER", 7, true);
    const future = authorizeWrite(fence, "SAFETY_SERVER", 9, true);
    const newWork = authorizeWrite(fence, "NEW_WORK", 7, true);

    // Then: only safety proceeds and it persists the current epoch.
    expect(safety).toEqual({ allowed: true, persistEpoch: 8, reason: "safety-lane" });
    expect(future).toEqual({ allowed: false, persistEpoch: 8, reason: "future-epoch" });
    expect(newWork).toEqual({ allowed: false, persistEpoch: 8, reason: "stale-epoch" });
  });

  it("validates the immutable cutover sequence exactly", () => {
    // Given: the frozen release order.
    const order = OPERATIONS_POLICY_V1.releaseOrder;

    // When: the exact order and an order with resume moved early are inspected.
    const exact = validateCutoverOrder(order);
    const unsafe = validateCutoverOrder([order[0], order[9], ...order.slice(1, 9)]);

    // Then: only the exact close-drain-fence-migrate-smoke-resume sequence passes.
    expect(exact).toEqual({ failedStep: null, valid: true });
    expect(unsafe.valid).toBe(false);
  });

  it("TASK14-LIFECYCLE-ROLLBACK rejects lifecycle rollback", () => {
    // Given: a rollback request that would reverse a completed lifecycle transition.
    const candidate = {
      codeBackwardCompatible: true,
      includesDataRollback: false,
      includesLifecycleRollback: true,
      includesSchemaContraction: false,
      targetReleaseDigest: SHA,
    };

    // When: rollback policy evaluates the request.
    const result = decideRollback(candidate);

    // Then: code compatibility cannot authorize lifecycle reversal.
    expect(result).toEqual({ allowed: false, reason: "lifecycle-rollback-forbidden" });
  });

  it("TASK14-RESTORE-DIGEST requires digest equality, raised epoch, and tombstone replay", () => {
    // Given: a fenced restore whose exported and restored record digests differ.
    const invalid = {
      approvalDigests: ["approval-a", "approval-b"],
      currentWriteEpoch: 4,
      exportCreatedAt: 1,
      exportDigest: "digest-before",
      restoredDigest: "digest-after",
      restoredWriteEpoch: 5,
      tombstoneDigestAfter: "tombstones",
      tombstoneDigestBefore: "tombstones",
      trafficClosed: true,
      writeFenceMode: "RECOVERY_VERIFY" as const,
    };

    // When: restore policy verifies the artifact.
    const blocked = evaluateRestore(invalid);
    const allowed = evaluateRestore({ ...invalid, restoredDigest: "digest-before" });

    // Then: mismatch blocks traffic while the proven restore receives a 30-day cleanup time.
    expect(blocked.failures).toContain("restore-digest-mismatch");
    expect(blocked.allowed).toBe(false);
    expect(allowed).toMatchObject({ allowed: true, nextWriteEpoch: 5 });
    expect(allowed.encryptedExportDeleteAt).toBe(2_592_000_001);
  });

  it("reports platform recovery truth and blocks an unproven boot", () => {
    // Given: no durable fence, meter sample, or external legal evidence is loaded.
    const input = {
      admissionState: "OPEN" as const,
      externalGatesPass: false,
      lastMeterSampleAt: null,
      meterRegistryComplete: false,
      now: 100,
      writeEpoch: null,
      writeFenceMode: null,
    };

    // When: the operational health document is built.
    const health = operationsHealth(input);

    // Then: it exposes exact recovery windows without claiming readiness.
    expect(health).toMatchObject({
      admissionState: "BOOT_BLOCKED",
      d1TimeTravelDays: 7,
      durableObjectPitrDays: 30,
      encryptedExportDeleteDaysAfterCutover: 30,
      externalGates: "BLOCK",
      queueRetentionHours: 24,
      status: "blocked",
    });
  });

  it("reports the derived admission state once every boot authority is complete", () => {
    // Given: all 15 meters, both external gates, and an OPEN fence are loaded.
    const input = {
      admissionState: "WARN" as const,
      externalGatesPass: true,
      lastMeterSampleAt: 90,
      meterRegistryComplete: true,
      now: 100,
      writeEpoch: 4,
      writeFenceMode: "OPEN" as const,
    };

    // When: the health document derives readiness.
    const health = operationsHealth(input);

    // Then: it reports the actual controller state instead of BOOT_BLOCKED.
    expect(health).toMatchObject({
      admissionState: "WARN",
      externalGates: "PASS",
      status: "ready",
      writeEpoch: 4,
      writeFenceMode: "OPEN",
    });
  });

  it("TASK14-KOREA-BLOCK fail-closes missing or malformed Korea evidence", () => {
    // Given: a release context with no approved Korea review artifact.
    const context = {
      adapterVersion: "unassigned",
      dataFlowDigest: SHA,
      endpointOrigins: ["https://example.invalid"] as const,
      environment: "production" as const,
      nowIso: "2026-07-29T00:00:00Z",
      providerId: "unassigned",
      releaseDigest: SHA,
      representedConditionGates: [],
      retentionPolicyDigest: SHA,
    };

    // When: an absent review crosses the release gate.
    const result = evaluateKoreaReview(undefined, context);

    // Then: absence is a deterministic BLOCK, never an inferred legal conclusion.
    expect(result).toEqual({ failedRuleIds: ["korea.schema"], verdict: "BLOCK" });
  });

  it("binds provider legal PASS to the deployed adapter and endpoint allowlist", () => {
    // Given: a schema-valid PASS artifact for a different provider integration.
    const placeholder = ProviderRightsRecordV1Schema.parse(
      JSON.parse(readFileSync(resolve(process.cwd(), "../legal/L01-provider-rights.json"), "utf8")),
    );
    const candidate = {
      ...placeholder,
      decision: "PASS" as const,
      providerId: "other-provider",
    };
    const context = {
      adapterVersion: "adapter-v2",
      dataFlowDigest: SHA,
      endpointOrigins: ["https://pilot.provider.example"] as const,
      environment: "production" as const,
      nowIso: "2026-07-29T12:00:00Z",
      providerId: "pilot-provider",
      releaseDigest: SHA,
      representedConditionGates: [],
      retentionPolicyDigest: SHA,
    };

    // When: release admission evaluates the artifact against the deployed integration.
    const result = evaluateProviderRights(candidate, context);

    // Then: a generic schema-valid PASS cannot authorize a different adapter or provider.
    expect(result.verdict).toBe("BLOCK");
    expect(result.failedRuleIds).toContain("provider.provider-id");
    expect(result.failedRuleIds).toContain("provider.adapter-version");
    expect(result.failedRuleIds).toContain("provider.endpoint-origins");
  });
});
