import {
  FeedbackPromptV1Schema,
  ReactionBodyV1Schema,
  ReactionRecordedV1Schema,
} from "../../../contracts/src";
import { authorizeFeedbackCapability } from "../feedback/capability";
import { FeedbackRepository } from "../feedback/repository";
import { hmacDigest, isCanonicalToken } from "../security/tokens";
import { jsonResponse, methodNotAllowed, publicError } from "./http-response";
import { parseMutationBody, sha256 } from "./journey-request";

const REACTION_PATH = /^\/api\/v1\/feedback\/(fid_v1\.[A-Za-z0-9_-]{22})\/reaction$/;

export async function handleFeedbackApi(
  request: Request,
  env: Env,
  hmacKey: CryptoKey,
  now: number,
  writeEpoch = 1,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/v1/feedback/eligible") {
    return request.method === "GET"
      ? eligibleFeedback(request, env, hmacKey, now, writeEpoch)
      : methodNotAllowed("GET");
  }
  const match = REACTION_PATH.exec(pathname);
  if (match === null) {
    return undefined;
  }
  const feedbackId = match[1];
  if (feedbackId === undefined) {
    return publicError("invalid_request");
  }
  return request.method === "POST"
    ? recordReaction(request, env, hmacKey, now, feedbackId, writeEpoch)
    : methodNotAllowed("POST");
}

async function eligibleFeedback(
  request: Request,
  env: Env,
  hmacKey: CryptoKey,
  now: number,
  writeEpoch: number,
): Promise<Response> {
  const digest = await authorizeFeedbackCapability(request.headers.get("authorization"), hmacKey);
  if (digest === undefined) {
    return publicError("capability_invalid");
  }
  const repository = new FeedbackRepository(env.DB, writeEpoch);
  const eligibility = await repository.find(digest);
  if (eligibility === null || eligibility.eligibility_state !== "eligible") {
    return publicError("capability_invalid");
  }
  if (eligibility.expires_at <= now) {
    await repository.expire(digest, now);
    return publicError("capability_expired");
  }
  if (eligibility.due_at > now) {
    return new Response(null, {
      headers: { "cache-control": "no-store, private" },
      status: 204,
    });
  }
  return jsonResponse(
    FeedbackPromptV1Schema.parse({
      actions: ["dislike", "like", "love", "did_not_visit"],
      contractVersion: 1,
      dueAt: eligibility.due_at,
      expiresAt: eligibility.expires_at,
      feedbackId: eligibility.feedback_id,
      promptVersion: eligibility.prompt_version,
    }),
  );
}

async function recordReaction(
  request: Request,
  env: Env,
  hmacKey: CryptoKey,
  now: number,
  feedbackId: string,
  writeEpoch: number,
): Promise<Response> {
  const parsed = await parseMutationBody(request, 1_024, new Set(["contractVersion", "reaction"]));
  if ("error" in parsed) {
    return publicError(parsed.error);
  }
  const body = ReactionBodyV1Schema.safeParse(parsed.value);
  if (!body.success) {
    return publicError("schema_invalid");
  }
  const capabilityDigest = await authorizeFeedbackCapability(
    request.headers.get("authorization"),
    hmacKey,
  );
  if (capabilityDigest === undefined) {
    return publicError("capability_invalid");
  }
  const rawKey = request.headers.get("idempotency-key");
  if (rawKey === null || !isCanonicalToken(rawKey, "ik_v1", 32)) {
    return publicError("idempotency_conflict");
  }
  const result = await new FeedbackRepository(env.DB, writeEpoch).consume({
    capabilityDigest,
    feedbackId,
    idempotencyDigest: await hmacDigest(hmacKey, `${capabilityDigest}\0${rawKey}`),
    now,
    reaction: body.data.reaction,
    requestDigest: await sha256(JSON.stringify(body.data)),
  });
  switch (result.kind) {
    case "recorded":
    case "replay":
      return jsonResponse(
        ReactionRecordedV1Schema.parse({
          contractVersion: 1,
          feedbackId: result.feedbackId,
          recorded: true,
        }),
        200,
        result.kind === "replay" ? { "idempotent-replayed": "true" } : undefined,
      );
    case "capability_expired":
      return publicError("capability_expired");
    case "capability_invalid":
      return publicError("capability_invalid");
    case "consent_required":
      return publicError("consent_required");
    case "idempotency_conflict":
      return publicError("idempotency_conflict");
    case "not_due":
      return publicError("invalid_transition");
    default:
      return assertNever(result);
  }
}

function assertNever(value: never): never {
  return value;
}
