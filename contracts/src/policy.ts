import { z } from "zod";

const MeterIdSchema = z.enum([
  "worker.dynamic_requests", "worker.http_cpu", "worker.logs_written",
  "d1.rows_read", "d1.rows_written", "d1.account_storage", "d1.database_storage",
  "do.requests", "do.duration", "do.rows_read", "do.rows_written", "do.account_storage",
  "do.object_storage", "queue.operations", "queue.retention",
]);

export const OPERATIONS_POLICY_V1 = {
  schemaVersion: 1,
  policyDate: "2026-07-29",
  warnFraction: 0.5,
  closeFraction: 0.8,
  firstSevenWindowUncertaintyFraction: 0.2,
  steadyUncertaintyMinimumFraction: 0.1,
  platformSampleIntervalSeconds: 300,
  dailySampleStaleAfterSeconds: 900,
  storageSampleStaleAfterSeconds: 21600,
  reopenFreshSampleCount: 2,
  reopenFreshSampleSpacingSeconds: 300,
  states: ["BOOT_BLOCKED", "OPEN", "WARN", "METER_BLOCK", "EXTERNAL_BLOCK", "WRITE_FENCED", "DEGRADED", "EMERGENCY_FROZEN", "RECOVERY_VERIFY"],
  racePrecedence: ["DELETE", "EXPIRE", "CONFIRM_STOP", "STOP_REQUEST", "ARRIVAL", "REVEAL", "ROUTE_REPAIR_OR_UPDATE", "COMMIT", "CONTINUE", "REACTION"],
  meterIds: [
    "worker.dynamic_requests", "worker.http_cpu", "worker.logs_written",
    "d1.rows_read", "d1.rows_written", "d1.account_storage", "d1.database_storage",
    "do.requests", "do.duration", "do.rows_read", "do.rows_written", "do.account_storage",
    "do.object_storage", "queue.operations", "queue.retention",
  ],
  retention: {
    sessionHours: 24,
    csrfMinutes: 30,
    preparedReceiptHours: 1,
    sealedSelectionDays: 180,
    inboxOutboxHours: 48,
    feedbackCapabilityDays: 7,
    coarseOperationsDays: 7,
    securityMigrationDeletionAuditDays: 180,
    queueDlqHours: 24,
    workerLogsDays: 3,
    d1TimeTravelDays: 7,
    durableObjectPitrDays: 30,
    tombstoneHours: 48,
  },
  releaseOrder: [
    "ADMISSION_CLOSE", "RESERVATION_DRAIN", "PRODUCER_FENCE", "QUEUE_OUTBOX_INBOX_DRAIN",
    "QUEUE_PAUSE", "BACKUP_BOOKMARK", "EXPAND_MIGRATION", "COMPATIBLE_CODE",
    "TERMINAL_SMOKE", "QUEUE_CONSUMER_PRODUCERS_ADMISSION_RESUME",
  ],
} as const;

export const OperationsPolicyV1Schema = z.object({
  schemaVersion: z.literal(1),
  policyDate: z.literal("2026-07-29"),
  warnFraction: z.literal(0.5),
  closeFraction: z.literal(0.8),
  firstSevenWindowUncertaintyFraction: z.literal(0.2),
  steadyUncertaintyMinimumFraction: z.literal(0.1),
  platformSampleIntervalSeconds: z.literal(300),
  dailySampleStaleAfterSeconds: z.literal(900),
  storageSampleStaleAfterSeconds: z.literal(21600),
  reopenFreshSampleCount: z.literal(2),
  reopenFreshSampleSpacingSeconds: z.literal(300),
  states: z.tuple([
    z.literal("BOOT_BLOCKED"), z.literal("OPEN"), z.literal("WARN"), z.literal("METER_BLOCK"),
    z.literal("EXTERNAL_BLOCK"), z.literal("WRITE_FENCED"), z.literal("DEGRADED"),
    z.literal("EMERGENCY_FROZEN"), z.literal("RECOVERY_VERIFY"),
  ]),
  racePrecedence: z.tuple([
    z.literal("DELETE"), z.literal("EXPIRE"), z.literal("CONFIRM_STOP"), z.literal("STOP_REQUEST"),
    z.literal("ARRIVAL"), z.literal("REVEAL"), z.literal("ROUTE_REPAIR_OR_UPDATE"),
    z.literal("COMMIT"), z.literal("CONTINUE"), z.literal("REACTION"),
  ]),
  meterIds: z.array(MeterIdSchema).length(15),
  retention: z.object({
    sessionHours: z.literal(24),
    csrfMinutes: z.literal(30),
    preparedReceiptHours: z.literal(1),
    sealedSelectionDays: z.literal(180),
    inboxOutboxHours: z.literal(48),
    feedbackCapabilityDays: z.literal(7),
    coarseOperationsDays: z.literal(7),
    securityMigrationDeletionAuditDays: z.literal(180),
    queueDlqHours: z.literal(24),
    workerLogsDays: z.literal(3),
    d1TimeTravelDays: z.literal(7),
    durableObjectPitrDays: z.literal(30),
    tombstoneHours: z.literal(48),
  }).strict(),
  releaseOrder: z.tuple([
    z.literal("ADMISSION_CLOSE"), z.literal("RESERVATION_DRAIN"), z.literal("PRODUCER_FENCE"),
    z.literal("QUEUE_OUTBOX_INBOX_DRAIN"), z.literal("QUEUE_PAUSE"), z.literal("BACKUP_BOOKMARK"),
    z.literal("EXPAND_MIGRATION"), z.literal("COMPATIBLE_CODE"), z.literal("TERMINAL_SMOKE"),
    z.literal("QUEUE_CONSUMER_PRODUCERS_ADMISSION_RESUME"),
  ]),
}).strict().readonly();

export const NAVIGATION_POLICY_V1 = {
  schemaVersion: 1,
  policyVersion: "navigation-v2-calibration-1",
  status: "calibration-only",
  routeCorridorEnterM: 35,
  routeCorridorExitM: 55,
  finalCorridorMaxDeviationM: 25,
  forwardTargetLookaheadM: 25,
  maxGuidanceAccuracyM: 35,
  maxMeasuredHeadingAccuracyDeg: 25,
  nearEnterM: 120,
  nearExitM: 150,
  arrivalEndpointM: 30,
  maxArrivalAccuracyM: 25,
  arrivalConsecutiveSamples: 4,
  arrivalMinimumDwellMs: 12000,
  arrivalSampleWindowMs: 20000,
  locationMaxAgeMs: 10000,
  headingMaxAgeMs: 10000,
  routeRevalidateAfterMs: 300000,
  routeAbsoluteMaxAgeMs: 1800000,
  maxBackwardProgressJumpM: 25,
  maxForwardProgressJumpM: 100,
  postVisibilityRequiresNewLocation: true,
  postVisibilityRequiresNewHeading: true,
  arrivedIsLatched: true,
} as const;

export const NavigationPolicyV1Schema = z.object({
  schemaVersion: z.literal(1),
  policyVersion: z.literal("navigation-v2-calibration-1"),
  status: z.literal("calibration-only"),
  routeCorridorEnterM: z.literal(35),
  routeCorridorExitM: z.literal(55),
  finalCorridorMaxDeviationM: z.literal(25),
  forwardTargetLookaheadM: z.literal(25),
  maxGuidanceAccuracyM: z.literal(35),
  maxMeasuredHeadingAccuracyDeg: z.literal(25),
  nearEnterM: z.literal(120),
  nearExitM: z.literal(150),
  arrivalEndpointM: z.literal(30),
  maxArrivalAccuracyM: z.literal(25),
  arrivalConsecutiveSamples: z.literal(4),
  arrivalMinimumDwellMs: z.literal(12000),
  arrivalSampleWindowMs: z.literal(20000),
  locationMaxAgeMs: z.literal(10000),
  headingMaxAgeMs: z.literal(10000),
  routeRevalidateAfterMs: z.literal(300000),
  routeAbsoluteMaxAgeMs: z.literal(1800000),
  maxBackwardProgressJumpM: z.literal(25),
  maxForwardProgressJumpM: z.literal(100),
  postVisibilityRequiresNewLocation: z.literal(true),
  postVisibilityRequiresNewHeading: z.literal(true),
  arrivedIsLatched: z.literal(true),
}).strict().readonly();

export const GateVerdictSchema = z.enum(["PASS", "BLOCK", "FAIL"]);
export function and3(verdicts: readonly z.infer<typeof GateVerdictSchema>[]): z.infer<typeof GateVerdictSchema> {
  if (verdicts.includes("FAIL")) {
    return "FAIL";
  }
  if (verdicts.includes("BLOCK")) {
    return "BLOCK";
  }
  return "PASS";
}
