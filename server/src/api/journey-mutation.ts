import { parseExpectedSequence } from "../security/sequence";
import { hmacDigest, isCanonicalToken } from "../security/tokens";
import { publicError } from "./http-response";
import {
  projectCommittedJourney,
  projectReadyJourney,
  projectRevealedJourney,
} from "./journey-composition";
import { clearGuard, findDeleteReplay, writeDeleteTombstone } from "./journey-persistence";
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

const VERSION_KEYS = new Set(["contractVersion"]);
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
  return projectSnapshot(
    await env.JOURNEYS.getByName(journeyId).snapshot(session.bindingDigest),
    session,
  );
}

export async function mutateJourney(
  request: Request,
  env: Env,
  dependencies: JourneyControllerDependencies,
  journeyId: string,
  action: "commit" | "reveal",
): Promise<Response> {
  const parsed = await parseMutationBody(request, 1_024, VERSION_KEYS);
  if ("error" in parsed) {
    return publicError(parsed.error);
  }
  if (parsed.body !== '{"contractVersion":1}') {
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
  const stub = env.JOURNEYS.getByName(journeyId);
  const snapshot = await stub.snapshot(session.bindingDigest);
  if (snapshot === undefined) {
    return publicError("not_found");
  }
  const prepared = await preparedFromSnapshot(snapshot, session);
  const nextProjection =
    action === "commit"
      ? projectCommittedJourney(prepared, snapshot.sequence + 1, false)
      : projectRevealedJourney(
          snapshot.phase === "ready"
            ? projectReadyJourney(prepared, snapshot.sequence, false)
            : projectCommittedJourney(prepared, snapshot.sequence, false),
          prepared.identity,
          snapshot.sequence + 1,
        );
  const responseBody = JSON.stringify(nextProjection);
  const result = await stub.transition({
    bodyDigest: await sha256(parsed.body),
    expectedSequence,
    idempotencyKeyDigest: await hmacDigest(dependencies.hmacKey, rawKey),
    now: dependencies.now(),
    outcomeCiphertext: await sealForSession(responseBody, session.sessionToken),
    type: action,
    writeEpoch: 1,
  });
  if (result.kind === "replay" && result.outcomeCiphertext !== undefined) {
    const replay = await openForSession(result.outcomeCiphertext, session.sessionToken);
    return typeof replay === "string"
      ? new Response(replay, { headers: JSON_HEADERS, status: 200 })
      : publicError("idempotency_conflict");
  }
  return result.kind === "applied"
    ? new Response(responseBody, { headers: JSON_HEADERS, status: 200 })
    : publicError(transitionError(result.kind));
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
