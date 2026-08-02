import { z } from "zod";
import { createJourneyDeletionSchemas } from "./journey-deletion-schemas";
import { createJourneyStateSchemas } from "./journey-state-schemas";

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
      expiresAt: positiveIntegerSchema,
      intentId: z.string().regex(/^ri_v1\.[A-Za-z0-9_-]{22}$/),
      type: z.literal("recovery-intent"),
    })
    .strict()
    .readonly(),
  commandBase
    .extend({
      intentId: z.string().regex(/^ri_v1\.[A-Za-z0-9_-]{22}$/),
      type: z.literal("recovery-confirm"),
    })
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
      choice: z.enum(["recalibrate", "reroute", "cached-route", "external-map"]),
      routeVersion: z.string().min(1).max(96).optional(),
      type: z.literal("route-recover"),
    })
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
    .extend({
      accuracyBand: z.enum(["poor", "acceptable", "good"]),
      consecutiveSamples: nonnegativeIntegerSchema.max(100),
      dwellMs: nonnegativeIntegerSchema.max(120_000),
      endpointDistanceBand: z.enum(["outside", "near", "within-arrival-threshold"]),
      routeConsistency: z.enum(["unknown", "inconsistent", "consistent"]),
      type: z.literal("arrival"),
    })
    .strict()
    .readonly(),
  commandBase
    .extend({
      reason: z.enum([
        "safety-concern",
        "route-or-sensor",
        "hard-condition",
        "venue-situation",
        "changed-mind",
        "schedule-changed",
        "skip",
      ]),
      type: z.literal("stop-reason"),
    })
    .strict()
    .readonly(),
  commandBase
    .extend({ type: z.literal("reveal") })
    .strict()
    .readonly(),
]);

const { inboxEventSchema, journeyStateSchema, outboxRecordSchema } = createJourneyStateSchemas({
  digestSchema,
  idSchema,
  nonnegativeIntegerSchema,
  positiveIntegerSchema,
  routeSchema,
  selectedSnapshotSchema,
});

const { beginDeletionSchema, resumeDeletionSchema, tombstoneReceiptSchema } =
  createJourneyDeletionSchemas({ digestSchema, nonnegativeIntegerSchema });

export {
  beginDeletionSchema,
  inboxEventSchema,
  journeyStateSchema,
  outboxRecordSchema,
  resumeDeletionSchema,
  tombstoneReceiptSchema,
};
