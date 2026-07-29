import { z } from "zod";

import { JourneyConstraintsV1Schema } from "../../../contracts/src/journey";
import type { JourneyDurableObject } from "../journey/durable-object";
import { parseExpectedSequence } from "../security/sequence";
import type { AuthenticatedSession } from "../security/session";
import { hmacDigest, isCanonicalToken, randomBase64Url } from "../security/tokens";
import { jsonResponse, publicError } from "./http-response";
import { findGuard, storeRecoveryDigest } from "./journey-persistence";
import {
  authError,
  authenticateMutation,
  type JourneyControllerDependencies,
  parseMutationBody,
  sha256,
  transitionError,
} from "./journey-request";
import { openForSession, sealForSession } from "./session-cipher";

const INTENT_KEYS = new Set(["contractVersion", "action"]);
const CONFIRM_KEYS = new Set([
  "contractVersion",
  "recoveryIntentId",
  "reviewedFields",
  "constraints",
]);
const intentBodySchema = z
  .object({
    action: z.literal("new-recommendation"),
    contractVersion: z.literal(1),
  })
  .strict()
  .readonly();
const confirmationBodySchema = z
  .object({
    constraints: JourneyConstraintsV1Schema,
    contractVersion: z.literal(1),
    recoveryIntentId: z.string().regex(/^ri_v1\.[A-Za-z0-9_-]{22}$/),
    reviewedFields: z.tuple([z.literal("all-constraints")]),
  })
  .strict()
  .readonly();

type RecoverySnapshot = Readonly<{
  phase: string;
  recoveryExpiresAt?: number | undefined;
  sequence: number;
  stopReason?: string | undefined;
}>;

export async function handleRecovery(
  request: Request,
  env: Env,
  dependencies: JourneyControllerDependencies,
  journeyId: string,
  action: "intent" | "confirm",
): Promise<Response> {
  const parsed = await parseMutationBody(
    request,
    1_024,
    action === "intent" ? INTENT_KEYS : CONFIRM_KEYS,
  );
  if ("error" in parsed) {
    return publicError(parsed.error);
  }
  const body =
    action === "intent"
      ? intentBodySchema.safeParse(parsed.value)
      : confirmationBodySchema.safeParse(parsed.value);
  if (!body.success) {
    return publicError("schema_invalid");
  }
  const session = await authenticateMutation(request, dependencies);
  if (session === undefined) {
    return authError(request);
  }
  const expectedSequence = parseExpectedSequence(
    request.headers.get("x-expected-sequence") ?? undefined,
  );
  const rawKey = request.headers.get("idempotency-key");
  if (expectedSequence === undefined || rawKey === null || !isCanonicalToken(rawKey, "ik_v1", 32)) {
    return publicError(
      expectedSequence === undefined ? "sequence_conflict" : "idempotency_conflict",
    );
  }
  const now = dependencies.now();
  const stub = env.JOURNEYS.getByName(journeyId);
  const snapshot = await stub.snapshot(session.bindingDigest);
  if (snapshot === undefined) {
    return publicError("not_found");
  }
  if (
    snapshot.phase !== "completed" ||
    snapshot.recoveryExpiresAt === undefined ||
    now >= snapshot.recoveryExpiresAt
  ) {
    return publicError(
      snapshot.stopReason === "schedule-changed" ? "recovery_not_allowed" : "invalid_transition",
    );
  }
  const guard = await findGuard(env.DB, session.bindingDigest);
  if (guard === undefined || guard.active_journey_digest !== null) {
    return publicError("recovery_review_required");
  }
  return action === "intent"
    ? issueIntent(parsed.body, rawKey, expectedSequence, snapshot, stub, session, env, dependencies)
    : issueCapability(
        parsed.body,
        rawKey,
        expectedSequence,
        confirmationBodySchema.parse(parsed.value),
        snapshot,
        stub,
        session,
        guard.recovery_capability_digest,
        env,
        dependencies,
      );
}

async function issueIntent(
  body: string,
  rawKey: string,
  expectedSequence: number,
  snapshot: RecoverySnapshot | undefined,
  stub: DurableObjectStub<JourneyDurableObject>,
  session: AuthenticatedSession | undefined,
  env: Env,
  dependencies: JourneyControllerDependencies,
): Promise<Response> {
  if (snapshot === undefined || session === undefined || snapshot.recoveryExpiresAt === undefined) {
    return publicError("invalid_transition");
  }
  const now = dependencies.now();
  const intentId = `ri_v1.${randomBase64Url(16)}`;
  const expiresAt = Math.min(snapshot.recoveryExpiresAt, now + 120_000);
  const responseBody = JSON.stringify({
    contractVersion: 1,
    expiresAt,
    issuedAt: now,
    previousDestinationExcluded: true,
    reasonPolicyVersion: "stop-reasons-v1",
    recoveryIntentId: intentId,
    requiredReviewFields: ["all-constraints"],
    status: "review-required",
  });
  const result = await stub.transition({
    bodyDigest: await sha256(body),
    expectedSequence,
    expiresAt,
    idempotencyKeyDigest: await hmacDigest(dependencies.hmacKey, rawKey),
    intentId,
    now,
    outcomeCiphertext: await sealForSession(responseBody, session.sessionToken),
    type: "recovery-intent",
    writeEpoch: 1,
  });
  if (result.kind === "replay" && result.outcomeCiphertext !== undefined) {
    return replayResponse(result.outcomeCiphertext, session.sessionToken, 201);
  }
  if (result.kind !== "applied") {
    return publicError(transitionError(result.kind));
  }
  const stored = await storeRecoveryDigest({
    bindingDigest: session.bindingDigest,
    database: env.DB,
    digest: await hmacDigest(dependencies.hmacKey, intentId),
    issuedAt: now,
  });
  return stored ? jsonResponse(JSON.parse(responseBody), 201) : publicError("service_unavailable");
}

async function issueCapability(
  body: string,
  rawKey: string,
  expectedSequence: number,
  confirmation: z.infer<typeof confirmationBodySchema>,
  snapshot: RecoverySnapshot,
  stub: DurableObjectStub<JourneyDurableObject>,
  session: AuthenticatedSession,
  storedIntentDigest: string | null,
  env: Env,
  dependencies: JourneyControllerDependencies,
): Promise<Response> {
  const now = dependencies.now();
  const recoveryExpiresAt = snapshot.recoveryExpiresAt;
  if (recoveryExpiresAt === undefined) {
    return publicError("recovery_not_allowed");
  }
  const intentDigest = await hmacDigest(dependencies.hmacKey, confirmation.recoveryIntentId);
  const guard = await findGuard(env.DB, session.bindingDigest);
  if (
    storedIntentDigest !== intentDigest ||
    guard?.last_stopped_at === null ||
    guard?.last_stopped_at === undefined ||
    now > guard.last_stopped_at + 120_000
  ) {
    return publicError(now >= recoveryExpiresAt ? "capability_expired" : "capability_invalid");
  }
  const rawCapability = `rc_v1.${randomBase64Url(32)}`;
  const constraints = JSON.stringify(confirmation.constraints);
  const expiresAt = Math.min(recoveryExpiresAt, guard.last_stopped_at + 120_000);
  const responseBody = JSON.stringify({
    contractVersion: 1,
    expiresAt,
    previousDestinationExcluded: true,
    recoveryCapability: rawCapability,
  });
  const result = await stub.transition({
    bodyDigest: await sha256(body),
    expectedSequence,
    idempotencyKeyDigest: await hmacDigest(dependencies.hmacKey, rawKey),
    intentId: confirmation.recoveryIntentId,
    now,
    outcomeCiphertext: await sealForSession(responseBody, session.sessionToken),
    type: "recovery-confirm",
    writeEpoch: 1,
  });
  if (result.kind === "replay" && result.outcomeCiphertext !== undefined) {
    return replayResponse(result.outcomeCiphertext, session.sessionToken, 201);
  }
  if (result.kind !== "applied") {
    return publicError(transitionError(result.kind));
  }
  const stored = await storeRecoveryDigest({
    bindingDigest: session.bindingDigest,
    database: env.DB,
    digest: await hmacDigest(dependencies.hmacKey, `${rawCapability}\0${constraints}`),
    issuedAt: guard.last_stopped_at,
  });
  return stored ? jsonResponse(JSON.parse(responseBody), 201) : publicError("service_unavailable");
}

async function replayResponse(
  ciphertext: string,
  sessionToken: string,
  status: number,
): Promise<Response> {
  const replay = await openForSession(ciphertext, sessionToken);
  return typeof replay === "string"
    ? new Response(replay, {
        headers: {
          "cache-control": "no-store, private",
          "content-type": "application/json; charset=utf-8",
          "idempotent-replayed": "true",
        },
        status,
      })
    : publicError("idempotency_conflict");
}
