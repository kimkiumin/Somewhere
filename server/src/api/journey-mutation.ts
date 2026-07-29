import type { Database } from "../db/database";
import { SessionRepository } from "../db/session-repository";
import { parseExpectedSequence } from "../security/sequence";
import { hmacDigest, isCanonicalToken, randomBase64Url } from "../security/tokens";
import { publicError } from "./http-response";
import {
  commandFor,
  keysFor,
  type LifecycleMutationAction,
  parseLifecycleBody,
} from "./journey-lifecycle-body";
import { predictSnapshot } from "./journey-lifecycle-prediction";
import {
  clearGuard,
  findDeleteReplay,
  markJourneyStopped,
  writeDeleteTombstone,
} from "./journey-persistence";
import { projectLifecycleJourney } from "./journey-projection";
import {
  authError,
  authenticateMutation,
  type JourneyControllerDependencies,
  parseMutationBody,
  preparedFromSnapshot,
  projectSnapshot,
  sha256,
  transitionError,
} from "./journey-request";
import { openForSession, sealForSession } from "./session-cipher";

const JSON_HEADERS = {
  "cache-control": "no-store, private",
  "content-type": "application/json; charset=utf-8",
} as const;

export async function getJourney(
  request: Request,
  env: Env,
  dependencies: JourneyControllerDependencies,
  journeyId: string,
): Promise<Response> {
  const session = await dependencies.sessionService.authenticateCookie(
    request.headers.get("cookie") ?? undefined,
    dependencies.now(),
  );
  if (session === undefined) {
    return publicError("session_expired");
  }
  if (
    (await findDeleteReplay(
      env.DB,
      await hmacDigest(dependencies.hmacKey, journeyId),
      dependencies.now(),
    )) !== undefined
  ) {
    return publicError("journey_expired");
  }
  const snapshot = await env.JOURNEYS.getByName(journeyId).snapshot(session.bindingDigest);
  if (snapshot !== undefined && dependencies.now() >= snapshot.expiresAt) {
    return publicError("journey_expired");
  }
  return projectSnapshot(snapshot, session);
}

export async function mutateJourney(
  request: Request,
  env: Env,
  dependencies: JourneyControllerDependencies,
  journeyId: string,
  action: LifecycleMutationAction,
): Promise<Response> {
  const parsed = await parseMutationBody(
    request,
    action === "route-recover" || action === "arrival" ? 2_048 : 1_024,
    keysFor(action),
  );
  if ("error" in parsed) {
    return publicError(parsed.error);
  }
  const body = parseLifecycleBody(action, parsed.value);
  if (body === undefined) {
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
  if (
    (await findDeleteReplay(
      env.DB,
      await hmacDigest(dependencies.hmacKey, journeyId),
      dependencies.now(),
    )) !== undefined
  ) {
    return publicError("journey_expired");
  }
  const stub = env.JOURNEYS.getByName(journeyId);
  const snapshot = await stub.snapshot(session.bindingDigest);
  if (snapshot === undefined) {
    return publicError("not_found");
  }
  const now = dependencies.now();
  if (now >= snapshot.expiresAt) {
    return publicError("journey_expired");
  }
  const prepared = await preparedFromSnapshot(snapshot, session);
  const commandDetails = commandFor(action, body, snapshot);
  const nextSnapshot = predictSnapshot(action, body, snapshot, commandDetails, now);
  const nextProjection = projectLifecycleJourney(prepared, nextSnapshot);
  const feedbackCapability =
    action === "arrival" && nextSnapshot.phase === "arrived"
      ? `fb_v1.${randomBase64Url(32)}`
      : undefined;
  const responseBody = JSON.stringify(
    feedbackCapability === undefined
      ? nextProjection
      : {
          feedbackCapability,
          requestId: `req_v1.${randomBase64Url(16)}`,
          result: nextProjection,
        },
  );
  const result = await stub.transition({
    bodyDigest: await sha256(parsed.body),
    expectedSequence,
    idempotencyKeyDigest: await hmacDigest(dependencies.hmacKey, rawKey),
    now,
    outcomeCiphertext: await sealForSession(responseBody, session.sessionToken),
    writeEpoch: 1,
    ...commandDetails,
  });
  if (result.kind === "replay" && result.outcomeCiphertext !== undefined) {
    const replay = await openForSession(result.outcomeCiphertext, session.sessionToken);
    return typeof replay === "string"
      ? new Response(replay, { headers: JSON_HEADERS, status: 200 })
      : publicError("idempotency_conflict");
  }
  if (result.kind !== "applied") {
    return publicError(transitionError(result.kind));
  }
  if (action === "confirm-stop") {
    await markJourneyStopped({
      bindingDigest: session.bindingDigest,
      database: env.DB,
      journeyDigest: await hmacDigest(dependencies.hmacKey, journeyId),
      now,
      previousCandidateDigest:
        snapshot.selectedSnapshot.receiptDigest ??
        (await hmacDigest(dependencies.hmacKey, snapshot.selectedSnapshot.selectionReceiptId)),
    });
  }
  if (feedbackCapability !== undefined && nextSnapshot.feedback !== undefined) {
    const capabilityDigest = await hmacDigest(dependencies.hmacKey, feedbackCapability);
    await new SessionRepository(env.DB satisfies Database).insertFeedbackEligibility({
      capability_digest: capabilityDigest,
      consumed_at: null,
      due_at: nextSnapshot.feedback.dueAt,
      eligibility_id: `eligibility:${capabilityDigest.slice(0, 48)}`,
      eligibility_state: "eligible",
      expires_at: now + 7 * 24 * 60 * 60 * 1_000,
      journey_hmac_digest: await hmacDigest(dependencies.hmacKey, journeyId),
    });
  }
  return new Response(responseBody, { headers: JSON_HEADERS, status: 200 });
}

export async function deleteJourney(
  request: Request,
  env: Env,
  dependencies: JourneyControllerDependencies,
  journeyId: string,
): Promise<Response> {
  const parsed = await parseMutationBody(request, 0, new Set());
  if ("error" in parsed) {
    return publicError(parsed.error);
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
  const journeyDigest = await hmacDigest(dependencies.hmacKey, journeyId);
  const deleteRequestDigest = await hmacDigest(dependencies.hmacKey, rawKey);
  const replay = await findDeleteReplay(env.DB, journeyDigest, dependencies.now());
  if (replay !== undefined) {
    return replay === deleteRequestDigest
      ? new Response(null, { headers: { "cache-control": "no-store, private" }, status: 204 })
      : publicError("journey_expired");
  }
  const stub = env.JOURNEYS.getByName(journeyId);
  const snapshot = await stub.snapshot(session.bindingDigest);
  if (snapshot === undefined) {
    return publicError("not_found");
  }
  if (dependencies.now() >= snapshot.expiresAt) {
    return publicError("journey_expired");
  }
  if (snapshot.sequence !== expectedSequence) {
    return publicError("sequence_conflict");
  }
  await writeDeleteTombstone({
    database: env.DB,
    deleteRequestDigest,
    journeyDigest,
    now: dependencies.now(),
  });
  await stub.deleteAfterTombstone({ durable: true, replayStatus: 204 });
  await clearGuard(env.DB, session.bindingDigest, journeyDigest);
  return new Response(null, {
    headers: { "cache-control": "no-store, private" },
    status: 204,
  });
}
