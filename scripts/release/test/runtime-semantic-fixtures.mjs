const eventDigest = "a".repeat(64);
const eventId = `evt_v1.${eventDigest.slice(0, 48)}`;
const poisonDigest = "c".repeat(64);

function passedReport(name, fullNames) {
  return {
    numPassedTests: fullNames.length,
    numFailedTests: 0,
    success: true,
    testResults: [{
      name,
      status: "passed",
      assertionResults: fullNames.map((fullName) => ({ fullName, status: "passed" })),
    }],
  };
}

const alarmReport = passedReport(
  "/repo/server/test/async-alarm-todo12.runtime.ts",
  [
    "Todo12 Durable Object alarm recovery keeps the exact journey expiry alarm across restart and cannot resurrect after tombstone delete",
    "Todo12 Durable Object alarm recovery runs the real Queue handler against D1 and acknowledges late tombstoned work",
  ],
);
const journeyReport = passedReport(
  "/repo/server/test/journey-do-cloudflare.runtime.ts",
  [
    "JourneyDurableObject Cloudflare runtime persists one atomic state, outcome, and outbox across eviction and replay",
    "JourneyDurableObject Cloudflare runtime removes SQLite state, replay values, outbox, and alarm after tombstone durability",
  ],
);
const fenceReport = passedReport(
  "/repo/server/test/task14-feedback-epoch.test.ts",
  [
    "Task 14 feedback write epoch atomically rejects stale feedback writes and receipts while current epoch succeeds",
    "Task 14 feedback write epoch rechecks the current OPEN fence inside the feedback batch",
    "Task 14 feedback write epoch rejects missing, stale, future, and closed-mode write authority",
    "Task 14 feedback write epoch converges concurrent exact-key reactions to one durable record",
  ],
);
const jsonDigest = (value) =>
  `sha256:${new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")}`;
const suiteSourceDigest = (key) =>
  `sha256:${new Bun.CryptoHasher("sha256").update(`source:${key}`).digest("hex")}`;

const fixtures = {
  "async-do-runtime-report.json": alarmReport,
  "journey-do-runtime-report.json": journeyReport,
  "live-do-fence-runtime.json": {
    schemaVersion: 2,
    scope: "local-deterministic-workerd",
    suites: [
      {
        key: "alarmRestart",
        path: "server/test/async-alarm-todo12.runtime.ts",
        sourceSha256: suiteSourceDigest("alarmRestart"),
        passed: true,
        assertionCount: 2,
        rawReport: {
          path: "async-do-runtime-report.json",
          sha256: jsonDigest(alarmReport),
        },
      },
      {
        key: "journeyState",
        path: "server/test/journey-do-cloudflare.runtime.ts",
        sourceSha256: suiteSourceDigest("journeyState"),
        passed: true,
        assertionCount: 2,
        rawReport: {
          path: "journey-do-runtime-report.json",
          sha256: jsonDigest(journeyReport),
        },
      },
      {
        key: "writeFence",
        path: "server/test/task14-feedback-epoch.test.ts",
        sourceSha256: suiteSourceDigest("writeFence"),
        passed: true,
        assertionCount: 4,
        rawReport: {
          path: "write-fence-runtime-report.json",
          sha256: jsonDigest(fenceReport),
        },
      },
    ],
  },
  "live-queue-chain.json": {
    schemaVersion: 1,
    scope: "local-deterministic-miniflare",
    producer: {
      trigger: "scheduled-handler",
      validFixtureEventIds: [eventId, `evt_v1.${"b".repeat(48)}`],
      invalidFixture: {
        body: { probe: "task14-invalid-queue", schemaVersion: 0 },
        poison: {
          failedAt: 1,
          failureCode: "invalid_message",
          originalEventDigest: poisonDigest,
          originalEventId: `evt_v1.${poisonDigest.slice(0, 48)}`,
          schemaVersion: 1,
        },
      },
    },
    queueDeliveries: [
      { acked: 0, total: 1 },
      { acked: 0, total: 1 },
      { acked: 0, total: 1 },
      { acked: 0, total: 1 },
      { acked: 1, total: 1 },
    ],
    poisonAttempts: [1, 2, 3, 4, 5].map((attempt) => ({
      attempt,
      originalEventDigest: poisonDigest,
    })),
    dlq: {
      deliveryCount: 1,
      auditReceipts: [{
        audit_event_id: `audit_v1.${poisonDigest}`,
        action_code: "dlq-delivery",
        poison_digest: poisonDigest,
        result_code: "poison-received",
        occurred_at: 1,
      }],
    },
    configuredMaxRetries: 4,
  },
  "live-scheduled-state.json": {
    schemaVersion: 1,
    scope: "local-deterministic-miniflare",
    trigger: { httpStatus: 200, responseBody: "ok" },
    message: {
      eventDigest,
      eventId,
      eventType: "journey.activation.repair",
      occurredAt: 1,
      schemaVersion: 1,
      subjectDigest: "b".repeat(64),
      writeEpoch: 1,
    },
    before: {
      outbox: {
        event_id: eventId,
        event_digest: eventDigest,
        delivery_state: "pending",
        acknowledged_at: null,
      },
    },
    after: {
      outbox: {
        event_id: eventId,
        event_digest: eventDigest,
        delivery_state: "delivered",
        acknowledged_at: 2,
      },
      inbox: {
        event_id: eventId,
        event_digest: eventDigest,
        event_type: "journey.activation.repair",
        result_code: "receipt_missing",
        write_epoch: 1,
      },
    },
  },
  "local-recovery-scope.json": {
    schemaVersion: 1,
    scope: "local-deterministic-sqlite-fixture",
    repositoryGate: "PASS",
    externalPitrGate: "BLOCK",
    sourceDigest: "d".repeat(64),
    restoredDigest: "d".repeat(64),
    writeEpoch: 5,
    sourceWriteEpoch: 4,
    restoredWriteEpochBeforeFence: 4,
    restoredWriteEpoch: 5,
    staleWriteRejected: true,
    encryptedExportRestored: true,
    tombstonesReapplied: true,
    retentionCleanupExecuted: true,
    retentionCleanup: {
      exportId: "export_overdue_00000000001",
      locationDigest: "e".repeat(64),
      deletionReceiptDigest: "f".repeat(64),
      inventoryState: "DELETED",
      artifactAbsent: true,
    },
    proves: [
      "portable-encrypted-export",
      "content-digest-equivalence",
      "tombstone-reapplication",
      "write-epoch-fencing",
      "local-retention-cleanup",
    ],
    externalRequirements: [
      "cloudflare-d1-time-travel",
      "cloudflare-durable-object-pitr",
      "authorized-production-credentials",
    ],
  },
  "write-fence-runtime-report.json": fenceReport,
};

export function runtimeSemanticFixture(path) {
  return fixtures[path];
}
