import { ArrivalMutationResponseV1Schema } from "../../../contracts/src";
import { describeFeedbackCapability, issueFeedbackCapability } from "../feedback/capability";
import { FeedbackRepository } from "../feedback/repository";
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
import { findDeleteReplay, findGuard, markJourneyStopped } from "./journey-persistence";
import { projectLifecycleJourney } from "./journey-projection";
import {
  authError,
  authenticateMutation,
  type JourneyControllerDependencies,
  parseMutationBody,
  preparedFromSnapshot,
  sha256,
  transitionError,
} from "./journey-request";
import { openForSession, sealForSession } from "./session-cipher";

const JSON_HEADERS = {
  "cache-control": "no-store, private",
  "content-type": "application/json; charset=utf-8",
} as const;

export async function mutateJourney(
  request: Request,
  env: Env,
  dependencies: JourneyControllerDependencies,
  journeyId: string,
  action: LifecycleMutationAction,
): Promise<Response> {
  const parsed = await parseMutationBody(
    request,
    dependencies.requestPolicy,
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
      ? await issueFeedbackCapability(dependencies.hmacKey)
      : undefined;
  const responseBody = JSON.stringify(
    feedbackCapability === undefined
      ? nextProjection
      : {
          contractVersion: 1,
          feedbackCapability: feedbackCapability.raw,
          requestId: `req_v1.${randomBase64Url(16)}`,
          result: nextProjection,
        },
  );
  const stoppedGuard =
    action === "confirm-stop"
      ? {
          bindingDigest: session.bindingDigest,
          database: env.DB,
          journeyDigest: await hmacDigest(dependencies.hmacKey, journeyId),
          previousCandidateDigest:
            snapshot.selectedSnapshot.receiptDigest ??
            (await hmacDigest(dependencies.hmacKey, snapshot.selectedSnapshot.selectionReceiptId)),
          stoppedAt: snapshot.stoppedAt ?? now,
        }
      : undefined;
  const result = await stub.transition({
    bodyDigest: await sha256(parsed.body),
    expectedSequence,
    idempotencyKeyDigest: await hmacDigest(dependencies.hmacKey, rawKey),
    now,
    outcomeCiphertext: await sealForSession(responseBody, session.sessionToken),
    writeEpoch: dependencies.writeEpoch,
    ...commandDetails,
  });
  if (result.kind === "replay" && result.outcomeCiphertext !== undefined) {
    if (stoppedGuard !== undefined && !(await completeStoppedGuard(stoppedGuard))) {
      return publicError("journey_expired");
    }
    const replay = await openForSession(result.outcomeCiphertext, session.sessionToken);
    if (typeof replay !== "string") {
      return publicError("idempotency_conflict");
    }
    const replayedArrival = parseArrivalReplay(replay);
    if (replayedArrival !== undefined) {
      const persisted = await persistFeedbackEligibility({
        bindingDigest: session.bindingDigest,
        database: env.DB,
        dueAt: replayedArrival.result.feedbackDueAt,
        hmacKey: dependencies.hmacKey,
        journeyId,
        rawCapability: replayedArrival.feedbackCapability,
        writeEpoch: dependencies.writeEpoch,
      });
      if (!persisted) {
        return publicError("journey_expired");
      }
    }
    return new Response(replay, {
      headers: { ...JSON_HEADERS, "idempotent-replayed": "true" },
      status: 200,
    });
  }
  if (result.kind !== "applied") {
    return publicError(transitionError(result.kind));
  }
  if (stoppedGuard !== undefined) {
    if (!(await completeStoppedGuard(stoppedGuard))) {
      return publicError("journey_expired");
    }
  }
  if (feedbackCapability !== undefined && nextSnapshot.feedback !== undefined) {
    const persisted = await persistFeedbackEligibility({
      bindingDigest: session.bindingDigest,
      database: env.DB,
      dueAt: nextSnapshot.feedback.dueAt,
      hmacKey: dependencies.hmacKey,
      journeyId,
      rawCapability: feedbackCapability.raw,
      writeEpoch: dependencies.writeEpoch,
    });
    if (!persisted) {
      return publicError("journey_expired");
    }
  }
  return new Response(responseBody, { headers: JSON_HEADERS, status: 200 });
}

export async function completeStoppedGuard(
  input: Readonly<{
    bindingDigest: string;
    database: D1Database;
    journeyDigest: string;
    previousCandidateDigest: string;
    stoppedAt: number;
  }>,
): Promise<boolean> {
  if (
    await markJourneyStopped({
      ...input,
      now: input.stoppedAt,
    })
  ) {
    return true;
  }
  const guard = await findGuard(input.database, input.bindingDigest);
  return guard?.active_journey_digest !== input.journeyDigest;
}

function parseArrivalReplay(
  replay: string,
): ReturnType<typeof ArrivalMutationResponseV1Schema.parse> | undefined {
  try {
    const parsed: unknown = JSON.parse(replay);
    const result = ArrivalMutationResponseV1Schema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

async function persistFeedbackEligibility(
  input: Readonly<{
    bindingDigest: string;
    database: D1Database;
    dueAt: number;
    hmacKey: CryptoKey;
    journeyId: string;
    rawCapability: string;
    writeEpoch: number;
  }>,
): Promise<boolean> {
  const repository = new FeedbackRepository(input.database, input.writeEpoch);
  const capability = await describeFeedbackCapability(input.rawCapability, input.hmacKey);
  return repository.issue({
    bindingDigest: input.bindingDigest,
    capabilityDigest: capability.digest,
    consentGranted: await repository.hasActiveConsent(input.bindingDigest),
    dueAt: input.dueAt,
    expiresAt: input.dueAt + 6 * 24 * 60 * 60 * 1_000 + 23 * 60 * 60 * 1_000,
    feedbackId: capability.feedbackId,
    journeyDigest: await hmacDigest(input.hmacKey, input.journeyId),
  });
}
