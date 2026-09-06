import { z } from "zod";

function canonicalBase64Url(prefix: string, encodedLength: number, decodedLength: number): z.ZodType<string> {
  return z.string().regex(new RegExp(`^${prefix}\\.[A-Za-z0-9_-]{${encodedLength}}$`)).refine((value) => {
    const encoded = value.slice(prefix.length + 1);
    const remainder = encoded.length % 4;
    const actualLength =
      Math.floor(encoded.length / 4) * 3 + (remainder === 2 ? 1 : remainder === 3 ? 2 : 0);
    const finalValue = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(
      encoded.at(-1) ?? "",
    );
    const canonicalTail =
      remainder === 0 ||
      (remainder === 2 && finalValue % 16 === 0) ||
      (remainder === 3 && finalValue % 4 === 0);
    return remainder !== 1 && actualLength === decodedLength && canonicalTail;
  }, "non-canonical base64url identifier");
}

export const JourneyIdSchema = canonicalBase64Url("j_v1", 22, 16).brand("JourneyId");
export const RequestIdSchema = canonicalBase64Url("req_v1", 22, 16).brand("RequestId");
export const FeedbackIdSchema = canonicalBase64Url("fid_v1", 22, 16).brand("FeedbackId");
export const RecoveryIntentIdSchema = canonicalBase64Url("ri_v1", 22, 16).brand("RecoveryIntentId");
export const IdempotencyKeySchema = canonicalBase64Url("ik_v1", 43, 32).brand("IdempotencyKey");
export const CsrfTokenSchema = canonicalBase64Url("csrf_v1", 43, 32).brand("CsrfToken");
export const RecoveryCapabilitySchema = canonicalBase64Url("rc_v1", 43, 32).brand("RecoveryCapability");
export const FeedbackCapabilitySchema = canonicalBase64Url("fb_v1", 43, 32).brand("FeedbackCapability");

const ContractVersionSchema = z.literal(1);
const UnixMillisecondsSchema = z.number().int().safe().nonnegative();
const SequenceSchema = z.number().int().safe().min(1);
const NonemptyTextSchema = z.string().trim().min(1).max(500);

export const SafeDisclosureV1Schema = z.object({
  routeDistanceM: z.number().finite().nonnegative(),
  routeDurationMinutes: z.number().finite().nonnegative(),
  representativeCategories: z.union([
    z.tuple([NonemptyTextSchema]),
    z.tuple([NonemptyTextSchema, NonemptyTextSchema]),
  ]),
  priceBand: z.enum(["low", "medium", "high", "unknown"]),
  policyVersion: NonemptyTextSchema,
}).strict().readonly();

export const RevealedIdentityV1Schema = z.object({
  name: NonemptyTextSchema,
  address: NonemptyTextSchema,
}).strict().readonly();

export const RouteGuidanceV1Schema = z.object({
  kind: z.literal("route"),
  encodedPolyline: z.string().min(1),
  routeDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  routeVersion: NonemptyTextSchema,
  expiresAt: UnixMillisecondsSchema,
}).strict().readonly();

const RouteFailureReasonSchema = z.enum(["route-stale", "location-poor", "heading-poor", "provider"]);
export const GuidanceUnavailableV1Schema = z.object({
  kind: z.literal("unavailable"),
  reason: RouteFailureReasonSchema,
}).strict().readonly();

const RoutePendingGuidanceV1Schema = z.object({
  kind: z.literal("unavailable"),
  reason: z.literal("route-pending"),
}).strict().readonly();

const RouteRepairV1Schema = z.union([
  z.object({ status: z.literal("idle") }).strict(),
  z.object({
    status: z.literal("repairing"),
    choice: z.enum(["recalibrate", "reroute", "cached-route"]),
  }).strict(),
  z.object({ status: z.literal("ready"), routeVersion: NonemptyTextSchema }).strict(),
  z.object({ status: z.literal("external-map-handed-off") }).strict(),
  z.object({ status: z.literal("failed"), reason: RouteFailureReasonSchema }).strict(),
]).readonly();

const FindingV1Schema = z.object({
  contractVersion: ContractVersionSchema,
  journeyId: JourneyIdSchema,
  sequence: SequenceSchema,
  phase: z.literal("finding"),
  pollAfterSeconds: z.number().int().min(1).max(5),
  actions: z.tuple([z.literal("poll"), z.literal("cancel")]),
}).strict().readonly();

const selectedBase = {
  contractVersion: ContractVersionSchema,
  journeyId: JourneyIdSchema,
  sequence: SequenceSchema,
  disclosure: SafeDisclosureV1Schema,
};

function unrevealedSelected<T extends z.ZodRawShape>(shape: T) {
  return z.object({
    ...selectedBase,
    ...shape,
    revealed: z.literal(false),
  }).strict().readonly();
}

function revealedSelected<T extends z.ZodRawShape>(shape: T) {
  return z.object({
    ...selectedBase,
    ...shape,
    revealed: z.literal(true),
    reveal: RevealedIdentityV1Schema,
  }).strict().readonly();
}

const ReadyR0Schema = unrevealedSelected({
  phase: z.literal("ready"),
  actions: z.tuple([z.literal("commit"), z.literal("stop")]),
});
const ReadyR1Schema = revealedSelected({
  phase: z.literal("ready"),
  actions: z.tuple([z.literal("commit"), z.literal("stop")]),
});
const CommittedR0Schema = unrevealedSelected({
  phase: z.literal("committed"),
  pollAfterSeconds: z.number().int().min(1).max(3),
  guidance: RoutePendingGuidanceV1Schema,
  actions: z.tuple([z.literal("poll"), z.literal("stop")]),
});
const CommittedR1Schema = revealedSelected({
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
const FollowingR1Schema = revealedSelected({
  phase: z.literal("following"),
  guidance: RouteGuidanceV1Schema,
  actions: z.tuple([z.literal("stop"), z.literal("route-recover"), z.literal("arrival")]),
});
const RouteRecoveryR0Schema = unrevealedSelected({
  phase: z.literal("route-recovery"),
  guidance: GuidanceUnavailableV1Schema,
  actions: z.tuple([z.literal("stop"), z.literal("route-recover")]),
});
const RouteRecoveryR1Schema = revealedSelected({
  phase: z.literal("route-recovery"),
  guidance: GuidanceUnavailableV1Schema,
  actions: z.tuple([z.literal("stop"), z.literal("route-recover")]),
});
const NearR0Schema = unrevealedSelected({
  phase: z.literal("near"),
  guidance: RouteGuidanceV1Schema,
  actions: z.tuple([z.literal("stop"), z.literal("route-recover"), z.literal("arrival")]),
});
const NearR1Schema = revealedSelected({
  phase: z.literal("near"),
  guidance: RouteGuidanceV1Schema,
  actions: z.tuple([z.literal("stop"), z.literal("route-recover"), z.literal("arrival")]),
});
const pausedShape = {
  phase: z.literal("paused"),
  phaseBeforePause: z.enum(["ready", "committed", "following", "route-recovery", "near"]),
  stopConfirmationId: z.string().regex(/^sc_v1\.[A-Za-z0-9_-]{22}$/),
  stopConfirmation: z.object({ copyVersion: NonemptyTextSchema }).strict().readonly(),
  routeRepair: RouteRepairV1Schema,
};
const PausedR0Schema = unrevealedSelected({
  ...pausedShape,
  actions: z.tuple([z.literal("continue"), z.literal("route-recover"), z.literal("confirm-stop"), z.literal("reveal")]),
});
const PausedR1Schema = revealedSelected({
  ...pausedShape,
  actions: z.tuple([z.literal("continue"), z.literal("route-recover"), z.literal("confirm-stop")]),
});
const StoppedR0Schema = unrevealedSelected({
  phase: z.literal("stopped"),
  stopReasonState: z.literal("required-or-skip"),
  actions: z.tuple([z.literal("record-reason"), z.literal("skip-reason"), z.literal("reveal")]),
});
const StoppedR1Schema = revealedSelected({
  phase: z.literal("stopped"),
  stopReasonState: z.literal("required-or-skip"),
  actions: z.tuple([z.literal("record-reason"), z.literal("skip-reason")]),
});
const CompletedRecoveryR0Schema = unrevealedSelected({
  phase: z.literal("completed"),
  stopReasonState: z.enum(["recorded", "skipped"]),
  recoveryExpiresAt: UnixMillisecondsSchema,
  actions: z.tuple([z.literal("reveal"), z.literal("recovery")]),
});
const CompletedRecoveryR1Schema = revealedSelected({
  phase: z.literal("completed"),
  stopReasonState: z.enum(["recorded", "skipped"]),
  recoveryExpiresAt: UnixMillisecondsSchema,
  actions: z.tuple([z.literal("recovery")]),
});
const CompletedNoRecoveryR0Schema = unrevealedSelected({
  phase: z.literal("completed"),
  stopReasonState: z.enum(["recorded", "skipped"]),
  actions: z.tuple([z.literal("reveal")]),
});
const CompletedNoRecoveryR1Schema = revealedSelected({
  phase: z.literal("completed"),
  stopReasonState: z.enum(["recorded", "skipped"]),
  actions: z.tuple([]),
});
const ArrivedR1Schema = revealedSelected({
  phase: z.literal("arrived"),
  feedbackDueAt: UnixMillisecondsSchema,
  actions: z.tuple([]),
});
const ExpiredV1Schema = z.object({
  contractVersion: ContractVersionSchema,
  journeyId: JourneyIdSchema,
  sequence: SequenceSchema,
  phase: z.literal("expired"),
  actions: z.tuple([]),
}).strict().readonly();

export const JourneyProjectionV1Schema = z.union([
  FindingV1Schema,
  ReadyR0Schema,
  ReadyR1Schema,
  CommittedR0Schema,
  CommittedR1Schema,
  FollowingR0Schema,
  FollowingR1Schema,
  RouteRecoveryR0Schema,
  RouteRecoveryR1Schema,
  NearR0Schema,
  NearR1Schema,
  PausedR0Schema,
  PausedR1Schema,
  StoppedR0Schema,
  StoppedR1Schema,
  CompletedRecoveryR0Schema,
  CompletedRecoveryR1Schema,
  CompletedNoRecoveryR0Schema,
  CompletedNoRecoveryR1Schema,
  ArrivedR1Schema,
  ExpiredV1Schema,
]);

export const JourneyConstraintsV1Schema = z.object({
  category: z.enum(["restaurant", "cafe"]),
  maxWalkMinutes: z.number().int().min(1).max(120),
  budgetBand: z.enum(["low", "medium", "high"]),
  dietary: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)).max(20),
  allergies: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)).max(20).default([]),
  accessibility: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)).max(20),
}).strict().readonly();

export const JourneyCreateBodyV1Schema = z.object({
  contractVersion: ContractVersionSchema,
  constraints: JourneyConstraintsV1Schema,
  origin: z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracyM: z.number().finite().nonnegative().max(10_000),
    capturedAt: UnixMillisecondsSchema,
  }).strict().readonly(),
  disclosureLevel: z.literal("standard"),
  recoveryCapability: RecoveryCapabilitySchema.nullable(),
}).strict().readonly();

export const ArrivalBodyV1Schema = z.object({
  contractVersion: ContractVersionSchema,
  endpointDistanceBand: z.enum(["outside", "near", "within-arrival-threshold"]),
  accuracyBand: z.enum(["poor", "acceptable", "good"]),
  consecutiveSamples: z.number().int().min(0).max(100),
  dwellMs: z.number().int().safe().nonnegative().max(120_000),
  routeConsistency: z.enum(["unknown", "inconsistent", "consistent"]),
}).strict().readonly();

export type JourneyProjectionV1 = z.infer<typeof JourneyProjectionV1Schema>;
