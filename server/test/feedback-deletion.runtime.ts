import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { FeedbackPromptV1Schema, ReactionRecordedV1Schema } from "../../contracts/src";
import { loadSessionHmacKey } from "../src/api/d1-session";
import { issueFeedbackCapability } from "../src/feedback/capability";
import { FeedbackRepository } from "../src/feedback/repository";

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

describe("Todo13 feedback deletion Workers runtime", () => {
  it("serves one identity-free prompt and rejects consent-off persistence", async () => {
    // Given: two due capabilities backed by real workerd D1, one with consent and one without.
    await migrateFeedbackRuntime();
    const now = Date.now();
    const key = await loadSessionHmacKey(env.DB);
    const consented = await issueFeedbackCapability(key);
    const localOnly = await issueFeedbackCapability(key);
    const repository = new FeedbackRepository(env.DB);
    await repository.issue({
      capabilityDigest: consented.digest,
      consentGranted: true,
      dueAt: now - 1,
      expiresAt: now + 7 * DAY,
      feedbackId: consented.feedbackId,
      journeyDigest: "a".repeat(64),
    });
    await repository.issue({
      capabilityDigest: localOnly.digest,
      consentGranted: false,
      dueAt: now - 1,
      expiresAt: now + 7 * DAY,
      feedbackId: localOnly.feedbackId,
      journeyDigest: "b".repeat(64),
    });

    // When: the prompt is read, a consent-off upload is attempted, and consented bytes replay.
    const promptResponse = await feedbackRequest("eligible", "GET", consented.raw);
    const prompt = FeedbackPromptV1Schema.parse(await promptResponse.json());
    const denied = await reactionRequest(localOnly, "A", "like");
    const recorded = await reactionRequest(consented, "B", "love");
    const recordedBody = await recorded.text();
    const replay = await reactionRequest(consented, "B", "love");
    const replayBody = await replay.text();
    const reactionCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM place_reactions",
    ).first<{ count: number }>();

    // Then: prompt/reaction bodies are identity-free, consent-off writes zero, and replay is exact.
    expect(promptResponse.status).toBe(200);
    expect(Object.keys(prompt).sort()).toEqual([
      "actions",
      "contractVersion",
      "dueAt",
      "expiresAt",
      "feedbackId",
      "promptVersion",
    ]);
    expect(denied.status).toBe(403);
    expect(recorded.status, recordedBody).toBe(200);
    expect(ReactionRecordedV1Schema.parse(JSON.parse(recordedBody))).toEqual({
      contractVersion: 1,
      feedbackId: consented.feedbackId,
      recorded: true,
    });
    expect(replayBody).toBe(recordedBody);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    expect(reactionCount?.count).toBe(1);
  });
});

async function migrateFeedbackRuntime(): Promise<void> {
  const statements = [
    "CREATE TABLE http_runtime_keys (key_name TEXT PRIMARY KEY, key_material TEXT NOT NULL) STRICT",
    "CREATE TABLE feedback_eligibility (eligibility_id TEXT PRIMARY KEY, journey_hmac_digest TEXT NOT NULL, capability_digest TEXT NOT NULL UNIQUE, eligibility_state TEXT NOT NULL, due_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER, feedback_id TEXT NOT NULL UNIQUE, prompt_version TEXT NOT NULL, consent_granted INTEGER NOT NULL, consent_binding_digest TEXT, consumption_digest TEXT) STRICT",
    "CREATE TABLE place_reactions (reaction_id TEXT PRIMARY KEY, reaction_code TEXT NOT NULL, reaction_version INTEGER NOT NULL, category TEXT NOT NULL, response_delay_band TEXT NOT NULL, policy_digest TEXT NOT NULL, recorded_at INTEGER NOT NULL, expires_at INTEGER NOT NULL) STRICT",
    "CREATE TABLE feedback_reaction_outcomes (capability_digest TEXT PRIMARY KEY, idempotency_digest TEXT NOT NULL, request_digest TEXT NOT NULL, feedback_id TEXT NOT NULL, expires_at INTEGER NOT NULL) STRICT",
  ] as const;
  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
}

function feedbackRequest(
  path: string,
  method: "GET" | "POST",
  capability: string,
): Promise<Response> {
  return SELF.fetch(`http://127.0.0.1:8787/api/v1/feedback/${path}`, {
    headers: { authorization: `Feedback ${capability}` },
    method,
  });
}

function reactionRequest(
  capability: Readonly<{ feedbackId: string; raw: string }>,
  keySuffix: string,
  reaction: "dislike" | "like" | "love" | "did_not_visit",
): Promise<Response> {
  return SELF.fetch(`http://127.0.0.1:8787/api/v1/feedback/${capability.feedbackId}/reaction`, {
    body: JSON.stringify({ contractVersion: 1, reaction }),
    headers: {
      authorization: `Feedback ${capability.raw}`,
      "content-type": "application/json",
      host: "127.0.0.1:8787",
      "idempotency-key": `ik_v1.${keySuffix.repeat(43)}`,
      origin: "http://127.0.0.1:8787",
      "sec-fetch-site": "same-origin",
    },
    method: "POST",
  });
}
