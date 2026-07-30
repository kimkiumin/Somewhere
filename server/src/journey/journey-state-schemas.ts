import { z } from "zod";

type JourneyStateSchemaDependencies<
  TRoute extends z.ZodType,
  TSelectedSnapshot extends z.ZodType,
> = Readonly<{
  digestSchema: z.ZodString;
  idSchema: z.ZodString;
  nonnegativeIntegerSchema: z.ZodNumber;
  positiveIntegerSchema: z.ZodNumber;
  routeSchema: TRoute;
  selectedSnapshotSchema: TSelectedSnapshot;
}>;

export function createJourneyStateSchemas<
  TRoute extends z.ZodType,
  TSelectedSnapshot extends z.ZodType,
>(dependencies: JourneyStateSchemaDependencies<TRoute, TSelectedSnapshot>) {
  const {
    digestSchema,
    idSchema,
    nonnegativeIntegerSchema,
    positiveIntegerSchema,
    routeSchema,
    selectedSnapshotSchema,
  } = dependencies;
  const storedOutcomeSchema = z
    .object({
      bodyDigest: digestSchema,
      expiresAt: positiveIntegerSchema,
      outcomeCiphertext: z.string().min(1).max(8_192),
    })
    .strict()
    .readonly();
  const phaseSchema = z.enum([
    "ready",
    "committed",
    "following",
    "route-recovery",
    "near",
    "arrived",
    "paused",
    "stopped",
    "completed",
  ]);
  const journeyStateSchema = z
    .object({
      activeRoute: routeSchema.optional(),
      browserBindingDigest: digestSchema,
      contractVersion: z.literal(1),
      expiresAt: positiveIntegerSchema,
      feedback: z
        .object({
          dueAt: positiveIntegerSchema,
          eventId: idSchema,
          status: z.enum(["scheduled", "eligible", "consumed"]),
        })
        .strict()
        .readonly()
        .optional(),
      idempotency: z.record(digestSchema, storedOutcomeSchema),
      journeyId: idSchema,
      openStop: z
        .object({
          confirmationId: idSchema,
          pauseEpoch: positiveIntegerSchema,
          phaseBeforePause: z.enum(["ready", "committed", "following", "route-recovery", "near"]),
        })
        .strict()
        .readonly()
        .optional(),
      pauseEpoch: nonnegativeIntegerSchema,
      phase: phaseSchema,
      revealed: z.boolean(),
      recoveryExpiresAt: positiveIntegerSchema.optional(),
      recoveryIntent: z
        .object({
          expiresAt: positiveIntegerSchema,
          intentId: z.string().regex(/^ri_v1\.[A-Za-z0-9_-]{22}$/),
        })
        .strict()
        .readonly()
        .optional(),
      routeRepair: z
        .union([
          z.object({ status: z.literal("idle") }).strict(),
          z
            .object({
              choice: z.enum(["recalibrate", "reroute", "cached-route"]),
              status: z.literal("repairing"),
            })
            .strict(),
          z.object({ routeVersion: z.string().min(1), status: z.literal("ready") }).strict(),
          z.object({ status: z.literal("external-map-handed-off") }).strict(),
          z
            .object({
              reason: z.enum(["route-stale", "location-poor", "heading-poor", "provider"]),
              status: z.literal("failed"),
            })
            .strict(),
        ])
        .readonly()
        .optional(),
      selectedSnapshot: selectedSnapshotSchema,
      sequence: nonnegativeIntegerSchema,
      stopReason: z
        .enum([
          "safety-concern",
          "route-or-sensor",
          "hard-condition",
          "venue-situation",
          "changed-mind",
          "schedule-changed",
          "skip",
        ])
        .optional(),
      stopReasonState: z.enum(["required-or-skip", "recorded", "skipped"]).optional(),
      stoppedAt: positiveIntegerSchema.optional(),
      writeEpoch: positiveIntegerSchema,
    })
    .strict()
    .readonly();
  const inboxEventSchema = z
    .object({
      eventDigest: digestSchema,
      eventId: idSchema,
      eventType: z.string().min(1).max(64),
      expiresAt: positiveIntegerSchema,
      receivedAt: positiveIntegerSchema,
      resultCode: z.string().min(1).max(64),
      writeEpoch: positiveIntegerSchema,
    })
    .strict()
    .readonly();
  const outboxRecordSchema = z
    .object({
      attempts: nonnegativeIntegerSchema,
      eventDigest: digestSchema,
      eventId: idSchema,
      eventType: z.string().min(1).max(64),
      expiresAt: positiveIntegerSchema,
      nextAttemptAt: positiveIntegerSchema,
      status: z.enum(["pending", "acknowledged"]),
      writeEpoch: positiveIntegerSchema,
    })
    .strict()
    .readonly();
  return { inboxEventSchema, journeyStateSchema, outboxRecordSchema };
}
