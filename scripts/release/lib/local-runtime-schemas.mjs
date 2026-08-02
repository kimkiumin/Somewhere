import { z } from "zod";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const boundDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const eventIdSchema = z.string().regex(/^evt_v1\.[a-f0-9]{48}$/);
const scopeSchema = z.literal("local-deterministic-miniflare");
const outboxSchema = z
  .object({
    event_id: eventIdSchema,
    event_digest: digestSchema,
    delivery_state: z.enum(["pending", "delivered"]),
    acknowledged_at: z.number().int().positive().nullable(),
  })
  .strict();
const inboxSchema = z
  .object({
    event_id: eventIdSchema,
    event_digest: digestSchema,
    event_type: z.literal("journey.activation.repair"),
    result_code: z.string().min(1),
    write_epoch: z.literal(1),
  })
  .strict();
export const scheduledSchema = z
  .object({
    schemaVersion: z.literal(1),
    scope: scopeSchema,
    trigger: z.object({
      httpStatus: z.literal(200),
      responseBody: z.literal("ok"),
    }).strict(),
    message: z.object({
      eventDigest: digestSchema,
      eventId: eventIdSchema,
      eventType: z.literal("journey.activation.repair"),
      occurredAt: z.number().int().positive(),
      schemaVersion: z.literal(1),
      subjectDigest: digestSchema,
      writeEpoch: z.literal(1),
    }).strict(),
    before: z.object({ outbox: outboxSchema }).strict(),
    after: z.object({ outbox: outboxSchema, inbox: inboxSchema }).strict(),
  })
  .strict();
export const testReportSchema = z
  .object({
    numPassedTests: z.number().int().positive(),
    numFailedTests: z.literal(0),
    success: z.literal(true),
    testResults: z.array(
      z.object({
        status: z.literal("passed"),
        name: z.string().min(1),
        assertionResults: z.array(
          z.object({
            fullName: z.string().min(1),
            status: z.literal("passed"),
          }).passthrough(),
        ).min(1),
      }).passthrough(),
    ).min(1),
  })
  .passthrough();
export const doFenceSchema = z
  .object({
    schemaVersion: z.literal(2),
    scope: z.literal("local-deterministic-workerd"),
    suites: z.array(z.object({
      key: z.enum(["alarmRestart", "journeyState", "writeFence"]),
      path: z.string().min(1),
      sourceSha256: boundDigestSchema,
      passed: z.literal(true),
      assertionCount: z.number().int().positive(),
      rawReport: z.object({
        path: z.string().min(1),
        sha256: boundDigestSchema,
      }).strict(),
    }).strict()).length(3),
  })
  .strict();
export const queueSchema = z
  .object({
    schemaVersion: z.literal(1),
    scope: scopeSchema,
    producer: z.object({
      trigger: z.literal("scheduled-handler"),
      validFixtureEventIds: z.array(eventIdSchema).min(2),
      invalidFixture: z.object({
        body: z.object({
          probe: z.literal("task14-invalid-queue"),
          schemaVersion: z.literal(0),
        }).strict(),
        poison: z.object({
          failedAt: z.number().int().positive(),
          failureCode: z.literal("invalid_message"),
          originalEventDigest: digestSchema,
          originalEventId: eventIdSchema,
          schemaVersion: z.literal(1),
        }).strict(),
      }).strict(),
    }).strict(),
    queueDeliveries: z.array(
      z.object({
        acked: z.number().int().nonnegative(),
        total: z.number().int().positive(),
      }).strict(),
    ).min(5),
    poisonAttempts: z.array(z.object({
      attempt: z.number().int().positive(),
      originalEventDigest: digestSchema,
    }).strict()).length(5),
    dlq: z.object({
      deliveryCount: z.literal(1),
      auditReceipts: z.array(z.object({
        audit_event_id: z.string().min(1),
        action_code: z.literal("dlq-delivery"),
        poison_digest: digestSchema,
        result_code: z.literal("poison-received"),
        occurred_at: z.number().int().positive(),
      }).strict()).length(1),
    }).strict(),
    configuredMaxRetries: z.literal(4),
  })
  .strict();
export const recoverySchema = z
  .object({
    schemaVersion: z.literal(1), scope: z.literal("local-deterministic-sqlite-fixture"),
    repositoryGate: z.literal("PASS"), externalPitrGate: z.literal("BLOCK"),
    sourceDigest: digestSchema, restoredDigest: digestSchema,
    writeEpoch: z.number().int().positive(), sourceWriteEpoch: z.number().int().positive(),
    restoredWriteEpochBeforeFence: z.number().int().positive(),
    restoredWriteEpoch: z.number().int().positive(), staleWriteRejected: z.literal(true),
    encryptedExportRestored: z.literal(true), tombstonesReapplied: z.literal(true),
    retentionCleanupExecuted: z.literal(true),
    retentionCleanup: z.object({
      exportId: z.string().min(20), locationDigest: digestSchema,
      deletionReceiptDigest: digestSchema, inventoryState: z.literal("DELETED"),
      artifactAbsent: z.literal(true),
    }).strict(),
    proves: z.tuple([
      z.literal("portable-encrypted-export"), z.literal("content-digest-equivalence"),
      z.literal("tombstone-reapplication"),
      z.literal("write-epoch-fencing"),
      z.literal("local-retention-cleanup"),
    ]),
    externalRequirements: z.array(z.enum([
      "cloudflare-d1-time-travel", "cloudflare-durable-object-pitr",
      "authorized-production-credentials",
    ])).length(3),
  })
  .strict();
export const localRuntimeBuildSchema = z
  .object({
    artifactRole: z.literal("local-diagnostic"),
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/u),
    sourceTree: z.string().regex(/^[a-f0-9]{40}$/u),
  })
  .passthrough();
export const preparedRuntimeBuildSchema = z.object({
  schemaVersion: z.literal(1),
  artifactRole: z.literal("prepared-release-candidate-reference"),
  sourceSha: z.string().regex(/^[a-f0-9]{40}$/u),
  sourceTree: z.string().regex(/^[a-f0-9]{40}$/u),
  preparedBuild: z.object({
    receiptSha256: boundDigestSchema,
    buildDigest: boundDigestSchema,
    artifactCount: z.number().int().positive(),
  }).strict(),
  sourceArchive: z.object({ sha256: boundDigestSchema }).strict(),
}).strict();

export const semanticPaths = [
  "async-do-runtime-report.json",
  "journey-do-runtime-report.json",
  "live-do-fence-runtime.json",
  "live-queue-chain.json",
  "live-scheduled-state.json",
  "local-recovery-scope.json",
  "write-fence-runtime-report.json",
];
