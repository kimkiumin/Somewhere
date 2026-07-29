import { z } from "zod";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const idSchema = z.string().min(16).max(96);
const positiveIntegerSchema = z.number().int().positive();
const nonnegativeIntegerSchema = z.number().int().nonnegative();

const routeSchema = z
  .object({
    geometry: z
      .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
      .min(2)
      .max(512),
    originZoneRef: z.string().min(1).max(96),
    routeDigest: digestSchema,
  })
  .strict()
  .readonly();

const selectedSnapshotSchema = z
  .object({
    createRequestDigest: digestSchema.optional(),
    destinationSnapshotCiphertext: z.string().min(1).max(8_192),
    disclosure: z
      .object({
        category: z.enum(["cafe", "restaurant"]),
        hint: z.string().min(1).max(160),
      })
      .strict()
      .readonly(),
    receiptDigest: digestSchema.optional(),
    selectionReceiptId: idSchema,
  })
  .strict()
  .readonly();

export const readyJourneyInputSchema = z
  .object({
    browserBindingDigest: digestSchema,
    expiresAt: positiveIntegerSchema,
    journeyId: idSchema,
    preparedRoute: routeSchema.optional(),
    selectedSnapshot: selectedSnapshotSchema,
    sequence: nonnegativeIntegerSchema,
    writeEpoch: positiveIntegerSchema,
  })
  .strict()
  .readonly();

const commandBase = z.object({
  bodyDigest: digestSchema,
  expectedSequence: nonnegativeIntegerSchema,
  idempotencyKeyDigest: digestSchema,
  now: positiveIntegerSchema,
  outcomeCiphertext: z.string().min(1).max(8_192),
  writeEpoch: positiveIntegerSchema,
});

export const journeyCommandSchema = z.discriminatedUnion("type", [
  commandBase
    .extend({ type: z.literal("commit") })
    .strict()
    .readonly(),
  commandBase
    .extend({
      capturedPauseEpoch: nonnegativeIntegerSchema,
      route: routeSchema,
      type: z.literal("route-activate"),
    })
    .strict()
    .readonly(),
  commandBase
    .extend({ type: z.literal("route-repair") })
    .strict()
    .readonly(),
  commandBase
    .extend({
      stopConfirmationId: idSchema,
      type: z.literal("stop-request"),
    })
    .strict()
    .readonly(),
  commandBase
    .extend({
      stopConfirmationId: idSchema,
      type: z.literal("continue"),
    })
    .strict()
    .readonly(),
  commandBase
    .extend({
      stopConfirmationId: idSchema,
      type: z.literal("confirm-stop"),
    })
    .strict()
    .readonly(),
  commandBase
    .extend({ type: z.literal("arrival") })
    .strict()
    .readonly(),
  commandBase
    .extend({ type: z.literal("reveal") })
    .strict()
    .readonly(),
]);

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

export const journeyStateSchema = z
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
    routeRepair: z
      .object({
        status: z.enum(["checking", "unavailable"]),
        updatedAt: positiveIntegerSchema,
      })
      .strict()
      .readonly()
      .optional(),
    selectedSnapshot: selectedSnapshotSchema,
    sequence: nonnegativeIntegerSchema,
    writeEpoch: positiveIntegerSchema,
  })
  .strict()
  .readonly();

export const inboxEventSchema = z
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

export const outboxRecordSchema = z
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

export const tombstoneReceiptSchema = z
  .object({ durable: z.literal(true), replayStatus: z.literal(204) })
  .strict()
  .readonly();
