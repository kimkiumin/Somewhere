import { z } from "zod";
import { ReleaseInputError } from "./release-core.mjs";
import {
  doFenceSchema,
  localRuntimeBuildSchema,
  preparedRuntimeBuildSchema,
  queueSchema,
  recoverySchema,
  scheduledSchema,
  testReportSchema,
} from "./local-runtime-schemas.mjs";
import { requiredRuntimeSuites } from "./runtime-suites.mjs";

function parseArtifact(artifact, schema) {
  let value;
  try {
    value = JSON.parse(artifact.data.toString());
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ReleaseInputError(`invalid local runtime evidence JSON: ${artifact.path}`);
    }
    throw error;
  }
  return schema.parse(value);
}

export function validateLocalRuntimeContract(indexed, expected) {
  try {
    const scheduled = parseArtifact(indexed.get("live-scheduled-state.json"), scheduledSchema);
    const doFence = parseArtifact(indexed.get("live-do-fence-runtime.json"), doFenceSchema);
    const queue = parseArtifact(indexed.get("live-queue-chain.json"), queueSchema);
    const recovery = parseArtifact(indexed.get("local-recovery-scope.json"), recoverySchema);
    const runtimeBuild = indexed.has("production-build.json")
      ? parseArtifact(
        indexed.get("production-build.json"),
        expected.preparedBuild === undefined ? localRuntimeBuildSchema : preparedRuntimeBuildSchema,
      )
      : undefined;
    const identity = scheduled.message.eventId;
    const digest = scheduled.message.eventDigest;
    const scheduledIdentityMatches =
      scheduled.before.outbox.event_id === identity
      && scheduled.after.outbox.event_id === identity
      && scheduled.after.inbox.event_id === identity
      && scheduled.before.outbox.event_digest === digest
      && scheduled.after.outbox.event_digest === digest
      && scheduled.after.inbox.event_digest === digest
      && scheduled.before.outbox.delivery_state === "pending"
      && scheduled.before.outbox.acknowledged_at === null
      && scheduled.after.outbox.delivery_state === "delivered"
      && scheduled.after.outbox.acknowledged_at !== null;
    const poison = queue.producer.invalidFixture.poison;
    const auditReceipt = queue.dlq.auditReceipts[0];
    const poisonIdentityMatches =
      poison.originalEventId === `evt_v1.${poison.originalEventDigest.slice(0, 48)}`;
    const auditIdentityMatches =
      auditReceipt.poison_digest === poison.originalEventDigest
      && auditReceipt.audit_event_id === `audit_v1.${poison.originalEventDigest}`;
    const failedDeliveries = queue.queueDeliveries
      .filter((delivery) => delivery.total > delivery.acked);
    const retryChainMatches =
      failedDeliveries.length === queue.configuredMaxRetries
      && failedDeliveries.every((delivery) => delivery.total - delivery.acked === 1)
      && queue.queueDeliveries.some((delivery) => delivery.total === 1 && delivery.acked === 1);
    const poisonAttemptsMatch =
      queue.poisonAttempts.every((attempt) =>
        attempt.originalEventDigest === poison.originalEventDigest)
      && queue.poisonAttempts.map((attempt) => attempt.attempt).join(",") === "1,2,3,4,5";
    const recoveryFenceMatches =
      recovery.sourceWriteEpoch + 1 === recovery.writeEpoch
      && recovery.restoredWriteEpochBeforeFence === recovery.sourceWriteEpoch
      && recovery.writeEpoch === recovery.restoredWriteEpoch;
    const expectedSuites = expected.runtimeSuites ?? requiredRuntimeSuites;
    const suitesMatch = doFence.suites.every((suite, index) => {
      const governed = expectedSuites[index];
      const rawArtifact = indexed.get(suite.rawReport.path);
      if (
        governed === undefined
        || suite.key !== governed.key
        || suite.path !== governed.path
        || suite.assertionCount !== governed.assertionCount
        || suite.rawReport.path !== governed.rawReport
        || rawArtifact === undefined
        || suite.rawReport.sha256 !== rawArtifact.sha256
        || (governed.sourceSha256 !== undefined
          && suite.sourceSha256 !== governed.sourceSha256)
      ) {
        return false;
      }
      const report = parseArtifact(rawArtifact, testReportSchema);
      const assertions = report.testResults.flatMap((result) => result.assertionResults);
      return (
        report.numPassedTests === governed.assertionCount
        && assertions.length === governed.assertionCount
        && assertions.every((assertion) => assertion.status === "passed")
        && (governed.executedPath === undefined
          || (report.testResults.length === 1
            && report.testResults[0].name === governed.executedPath))
      );
    });
    const preparedBuildMatches = expected.preparedBuild === undefined
      || (
        runtimeBuild?.preparedBuild.receiptSha256 === expected.preparedBuild.receiptSha256
        && runtimeBuild.preparedBuild.buildDigest === expected.preparedBuild.buildDigest
        && runtimeBuild.preparedBuild.artifactCount === expected.preparedBuild.artifactCount
        && runtimeBuild.sourceArchive.sha256 === expected.preparedBuild.sourceArchiveSha256
      );
    if (
      !scheduledIdentityMatches
      || !suitesMatch
      || !queue.producer.validFixtureEventIds.includes(identity)
      || !poisonIdentityMatches
      || !auditIdentityMatches
      || !retryChainMatches
      || !poisonAttemptsMatch
      || !recoveryFenceMatches
      || recovery.sourceDigest !== recovery.restoredDigest
      || (runtimeBuild !== undefined
        && (runtimeBuild.sourceSha !== expected.sha
          || runtimeBuild.sourceTree !== expected.sourceTree
          || !preparedBuildMatches))
    ) {
      throw new ReleaseInputError("local runtime evidence causal contract mismatch");
    }
  } catch (error) {
    if (error instanceof ReleaseInputError) throw error;
    if (error instanceof z.ZodError) {
      throw new ReleaseInputError("invalid local runtime evidence contract");
    }
    throw error;
  }
}
