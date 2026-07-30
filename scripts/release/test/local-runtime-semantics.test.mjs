import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createVerifyV2RuntimeEvidence } from "../lib/verify-v2-runtime-evidence.mjs";
import {
  removeTemporaryDirectory,
  temporaryDirectory,
  writeJson,
} from "./release-testkit.mjs";
import { runtimeSemanticFixture } from "./runtime-semantic-fixture.mjs";

const finalSha = "a".repeat(40);
const sourceTree = "b".repeat(40);
const semanticPaths = [
  "async-do-runtime-report.json",
  "journey-do-runtime-report.json",
  "live-do-fence-runtime.json",
  "live-queue-chain.json",
  "live-scheduled-state.json",
  "local-recovery-scope.json",
  "write-fence-runtime-report.json",
].sort();
const runtimeSuites = runtimeSemanticFixture("live-do-fence-runtime.json").suites.map((suite) => ({
  key: suite.key,
  path: suite.path,
  rawReport: suite.rawReport.path,
  assertionCount: suite.assertionCount,
  sourceSha256: suite.sourceSha256,
  executedPath: `/repo/${suite.path}`,
}));

async function binding(root, mutate = () => {}) {
  const evidence = resolve(root, "evidence");
  const registry = resolve(root, "registry.json");
  await mkdir(evidence);
  await writeJson(registry, {
    schemaVersion: 1,
    artifacts: semanticPaths.map((path) => ({ path, kind: "runtime-contract" })),
  });
  for (const path of semanticPaths) {
    const fixture = structuredClone(runtimeSemanticFixture(path));
    mutate(path, fixture);
    await writeFile(resolve(evidence, path), JSON.stringify(fixture));
  }
  return createVerifyV2RuntimeEvidence({
    sha: finalSha,
    sourceTree,
    registry,
    evidenceDir: evidence,
    runtimeSuites,
    command: {
      argv: ["bun", "run", "verify:v2"],
      exitCode: 0,
      stdoutSha256: `sha256:${"0".repeat(64)}`,
      stderrSha256: `sha256:${"1".repeat(64)}`,
    },
  });
}

describe("F2 local runtime semantics", () => {
  test("rejects hash-complete artifacts that do not establish the required local claims", async () => {
    // Given: a complete, regular-file artifact set containing empty semantic claims.
    const root = await temporaryDirectory("f2-runtime-semantics");
    try {
      const evidence = resolve(root, "evidence");
      const registry = resolve(root, "registry.json");
      await mkdir(evidence);
      await writeJson(registry, {
        schemaVersion: 1,
        artifacts: semanticPaths.map((path) => ({ path, kind: "runtime-contract" })),
      });
      for (const path of semanticPaths) {
        await writeFile(resolve(evidence, path), "{}\n");
      }

      // When: the exact runtime evidence set is bound.
      const binding = createVerifyV2RuntimeEvidence({
        sha: finalSha,
        sourceTree,
        registry,
        evidenceDir: evidence,
        command: {
          argv: ["bun", "run", "verify:v2"],
          exitCode: 0,
          stdoutSha256: `sha256:${"0".repeat(64)}`,
          stderrSha256: `sha256:${"1".repeat(64)}`,
        },
      });

      // Then: digest completeness cannot substitute for meaningful runtime semantics.
      await expect(binding).rejects.toThrow("local runtime evidence");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("accepts a complete causal local runtime contract", async () => {
    // Given: a coherent scheduled, DO/fence, queue/DLQ, and recovery artifact set.
    const root = await temporaryDirectory("f2-runtime-coherent");
    try {
      // When: the exact runtime evidence set is bound.
      const primary = await binding(root);

      // Then: all four semantic artifacts are admitted into the digest-bound manifest.
      expect(primary.runtimeEvidence.artifactCount).toBe(semanticPaths.length);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a scheduled transition whose D1 identity changes", async () => {
    // Given: a scheduled artifact whose delivered outbox belongs to another event.
    const root = await temporaryDirectory("f2-runtime-scheduled-identity");
    try {
      // When: the exact runtime evidence set is bound.
      const result = binding(root, (path, fixture) => {
        if (path === "live-scheduled-state.json") {
          fixture.after.outbox.event_id = `evt_v1.${"e".repeat(48)}`;
        }
      });

      // Then: the cross-artifact identity contract fails closed.
      await expect(result).rejects.toThrow("causal contract mismatch");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects incomplete retry evidence and unequal recovery digests", async () => {
    // Given: one missing queue retry and a non-equivalent restored database.
    const root = await temporaryDirectory("f2-runtime-retry-recovery");
    try {
      // When: the exact runtime evidence set is bound.
      const result = binding(root, (path, fixture) => {
        if (path === "live-queue-chain.json") fixture.queueDeliveries.shift();
        if (path === "local-recovery-scope.json") fixture.restoredDigest = "e".repeat(64);
      });

      // Then: neither cardinality nor a claimed local restore can be inferred.
      await expect(result).rejects.toThrow("local runtime evidence");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a DLQ audit receipt bound to a different poison digest", async () => {
    // Given: the durable audit receipt names a digest other than the delivered poison.
    const root = await temporaryDirectory("f2-runtime-dlq-digest");
    try {
      // When: the exact runtime evidence set is bound.
      const result = binding(root, (path, fixture) => {
        if (path === "live-queue-chain.json") {
          fixture.dlq.auditReceipts[0].poison_digest = "d".repeat(64);
        }
      });

      // Then: a structurally valid but causally unrelated audit receipt fails closed.
      await expect(result).rejects.toThrow("causal contract mismatch");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects unrelated passing tests presented as Durable Object evidence", async () => {
    // Given: three green reports whose test identity is unrelated to the governed claims.
    const root = await temporaryDirectory("f2-runtime-do-identity");
    try {
      // When: unrelated suites and assertions are bound as the DO/fence artifact.
      const result = binding(root, (path, fixture) => {
        if (path.endsWith("-runtime-report.json")) {
          fixture.testResults[0].name = "/tmp/unrelated.test.ts";
          fixture.testResults[0].assertionResults[0].fullName = "unrelated passing test";
        }
      });

      // Then: green status alone cannot establish the named runtime behavior.
      await expect(result).rejects.toThrow("causal contract mismatch");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects no-op reports that preserve the old governed assertion names", async () => {
    // Given: green no-op reports preserve every old assertion label and only mimic the file suffix.
    const root = await temporaryDirectory("f2-runtime-do-no-op");
    try {
      const result = binding(root, (path, fixture) => {
        if (path.endsWith("-runtime-report.json")) {
          fixture.testResults[0].name = `/tmp/no-op${fixture.testResults[0].name.slice(
            fixture.testResults[0].name.indexOf("/server/"),
          )}`;
        }
      });

      // Then: assertion display names cannot stand in for the selected executable source.
      await expect(result).rejects.toThrow("causal contract mismatch");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects runtime suites whose claimed executable source digest changed", async () => {
    // Given: otherwise coherent reports claim a different executable source identity.
    const root = await temporaryDirectory("f2-runtime-do-source-digest");
    try {
      const result = binding(root, (path, fixture) => {
        if (path === "live-do-fence-runtime.json") {
          for (const suite of fixture.suites) {
            suite.sourceSha256 = `sha256:${"f".repeat(64)}`;
          }
        }
      });

      // Then: a green report cannot detach itself from the exact source archive.
      await expect(result).rejects.toThrow("causal contract mismatch");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects arbitrary recovery proof labels", async () => {
    // Given: a successful restore artifact with five meaningless proof labels.
    const root = await temporaryDirectory("f2-runtime-recovery-labels");
    try {
      // When: the recovery artifact is bound.
      const result = binding(root, (path, fixture) => {
        if (path === "local-recovery-scope.json") {
          fixture.proves = ["a", "b", "c", "d", "e"];
        }
      });

      // Then: cardinality cannot substitute for the five governed recovery properties.
      await expect(result).rejects.toThrow("local runtime evidence");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects retry attempts that are not keyed to the delivered poison", async () => {
    // Given: five attempts are claimed for an unrelated message digest.
    const root = await temporaryDirectory("f2-runtime-poison-attempt-identity");
    try {
      // When: the queue chain is bound.
      const result = binding(root, (path, fixture) => {
        if (path === "live-queue-chain.json") {
          fixture.poisonAttempts[2].originalEventDigest = "e".repeat(64);
        }
      });

      // Then: aggregate retry cardinality cannot establish the poison chain.
      await expect(result).rejects.toThrow("causal contract mismatch");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a recovery receipt whose restored fence differs from its claimed epoch", async () => {
    // Given: the recovered database reports a different fence than the receipt claim.
    const root = await temporaryDirectory("f2-runtime-recovery-fence");
    try {
      // When: the recovery artifact is bound.
      const result = binding(root, (path, fixture) => {
        if (path === "local-recovery-scope.json") fixture.restoredWriteEpoch = 4;
      });

      // Then: a hard-coded receipt epoch cannot establish write fencing.
      await expect(result).rejects.toThrow("causal contract mismatch");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a recovery receipt without an observed stale-write rejection", async () => {
    // Given: the recovered fence advances but no stale write is proven to fail.
    const root = await temporaryDirectory("f2-runtime-recovery-stale-write");
    try {
      // When: the recovery artifact claims that the stale write was accepted.
      const result = binding(root, (path, fixture) => {
        if (path === "local-recovery-scope.json") fixture.staleWriteRejected = false;
      });

      // Then: fence advancement without runtime enforcement fails closed.
      await expect(result).rejects.toThrow("local runtime evidence");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects retention cleanup that is not bound to an absent artifact", async () => {
    // Given: the inventory row is marked deleted while the governed artifact remains.
    const root = await temporaryDirectory("f2-runtime-retention-binding");
    try {
      // When: the recovery artifact reports the exact retained file as present.
      const result = binding(root, (path, fixture) => {
        if (path === "local-recovery-scope.json") {
          fixture.retentionCleanup.artifactAbsent = false;
        }
      });

      // Then: an inventory transition alone cannot establish artifact cleanup.
      await expect(result).rejects.toThrow("local runtime evidence");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
