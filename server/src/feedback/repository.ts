import { z } from "zod";
import type { Database } from "../db/database";
import { firstParsed } from "../db/database";

const DAY = 24 * 60 * 60 * 1_000;
const FEEDBACK_POLICY_DIGEST = "f".repeat(64);

const feedbackRowSchema = z
  .object({
    capability_digest: z.string().length(64),
    consent_binding_digest: z.string().length(64).nullable(),
    consent_granted: z.union([z.literal(0), z.literal(1)]),
    consumed_at: z.number().nullable(),
    consumption_digest: z.string().length(64).nullable(),
    due_at: z.number().int().positive(),
    eligibility_state: z.enum(["eligible", "consumed", "revoked", "expired"]),
    expires_at: z.number().int().positive(),
    feedback_id: z.string(),
    journey_hmac_digest: z.string().length(64),
    prompt_version: z.string(),
  })
  .strict()
  .readonly();

const outcomeSchema = z
  .object({
    feedback_id: z.string(),
    idempotency_digest: z.string().length(64),
    request_digest: z.string().length(64),
  })
  .strict()
  .readonly();

export type FeedbackEligibility = z.infer<typeof feedbackRowSchema>;
export type FeedbackReaction =
  | Readonly<{ kind: "recorded"; feedbackId: string }>
  | Readonly<{ kind: "replay"; feedbackId: string }>
  | Readonly<{
      kind:
        | "capability_invalid"
        | "capability_expired"
        | "consent_required"
        | "idempotency_conflict"
        | "not_due";
    }>;

export class FeedbackRepository {
  constructor(private readonly database: Database) {}

  async issue(
    input: Readonly<{
      capabilityDigest: string;
      bindingDigest?: string;
      consentGranted: boolean;
      dueAt: number;
      expiresAt: number;
      feedbackId: string;
      journeyDigest: string;
    }>,
  ): Promise<void> {
    await this.database
      .prepare(
        "INSERT OR IGNORE INTO feedback_eligibility (eligibility_id, journey_hmac_digest, capability_digest, eligibility_state, due_at, expires_at, consumed_at, feedback_id, prompt_version, consent_granted, consent_binding_digest, consumption_digest) VALUES (?, ?, ?, 'eligible', ?, ?, NULL, ?, 'feedback-prompt-v1', ?, ?, NULL)",
      )
      .bind(
        `eligibility:${input.capabilityDigest.slice(0, 48)}`,
        input.journeyDigest,
        input.capabilityDigest,
        input.dueAt,
        input.expiresAt,
        input.feedbackId,
        input.consentGranted ? 1 : 0,
        input.bindingDigest ?? null,
      )
      .run();
  }

  async hasActiveConsent(bindingDigest: string): Promise<boolean> {
    const row = z
      .object({ decision: z.enum(["granted", "withdrawn"]) })
      .strict()
      .nullable()
      .parse(
        await this.database
          .prepare(
            "SELECT decision FROM consent_ledger WHERE session_binding_digest = ? AND consent_kind = 'feedback' ORDER BY decided_at DESC LIMIT 1",
          )
          .bind(bindingDigest)
          .first(),
      );
    return row?.decision === "granted";
  }

  find(capabilityDigest: string): Promise<FeedbackEligibility | null> {
    return firstParsed(
      this.database
        .prepare(
          "SELECT capability_digest, consent_binding_digest, consent_granted, consumed_at, consumption_digest, due_at, eligibility_state, expires_at, feedback_id, journey_hmac_digest, prompt_version FROM feedback_eligibility WHERE capability_digest = ?",
        )
        .bind(capabilityDigest),
      feedbackRowSchema,
    );
  }

  async expire(capabilityDigest: string, now: number): Promise<void> {
    await this.database
      .prepare(
        "UPDATE feedback_eligibility SET eligibility_state = 'expired' WHERE capability_digest = ? AND expires_at <= ? AND eligibility_state = 'eligible'",
      )
      .bind(capabilityDigest, now)
      .run();
  }

  async revokeJourney(journeyDigest: string): Promise<void> {
    await this.database
      .prepare(
        "UPDATE feedback_eligibility SET eligibility_state = 'revoked' WHERE journey_hmac_digest = ? AND eligibility_state = 'eligible'",
      )
      .bind(journeyDigest)
      .run();
  }

  async deleteJourney(journeyDigest: string): Promise<void> {
    await this.database
      .prepare("DELETE FROM feedback_eligibility WHERE journey_hmac_digest = ?")
      .bind(journeyDigest)
      .run();
  }

  async consume(
    input: Readonly<{
      capabilityDigest: string;
      feedbackId: string;
      idempotencyDigest: string;
      now: number;
      reaction: "dislike" | "like" | "love" | "did_not_visit";
      requestDigest?: string;
    }>,
  ): Promise<FeedbackReaction> {
    const requestDigest = input.requestDigest ?? input.idempotencyDigest;
    const prior = await this.findOutcome(input.capabilityDigest);
    if (prior !== null) {
      return prior.idempotency_digest === input.idempotencyDigest &&
        prior.request_digest === requestDigest
        ? { feedbackId: prior.feedback_id, kind: "replay" }
        : { kind: "idempotency_conflict" };
    }
    const eligibility = await this.find(input.capabilityDigest);
    if (eligibility === null || eligibility.feedback_id !== input.feedbackId) {
      return { kind: "capability_invalid" };
    }
    if (eligibility.expires_at <= input.now) {
      await this.expire(input.capabilityDigest, input.now);
      return { kind: "capability_expired" };
    }
    if (eligibility.eligibility_state !== "eligible") {
      return { kind: "capability_invalid" };
    }
    if (eligibility.due_at > input.now) {
      return { kind: "not_due" };
    }
    if (
      eligibility.consent_granted === 0 ||
      (eligibility.consent_binding_digest !== null &&
        !(await this.hasActiveConsent(eligibility.consent_binding_digest)))
    ) {
      return { kind: "consent_required" };
    }
    await this.database
      .prepare(
        "UPDATE feedback_eligibility SET eligibility_state = 'consumed', consumed_at = ?, consumption_digest = ? WHERE capability_digest = ? AND feedback_id = ? AND eligibility_state = 'eligible' AND due_at <= ? AND expires_at > ? AND consent_granted = 1",
      )
      .bind(
        input.now,
        input.idempotencyDigest,
        input.capabilityDigest,
        input.feedbackId,
        input.now,
        input.now,
      )
      .run();
    const consumed = await this.find(input.capabilityDigest);
    if (consumed?.consumption_digest !== input.idempotencyDigest) {
      return { kind: "idempotency_conflict" };
    }
    await this.database
      .prepare(
        "INSERT INTO place_reactions (reaction_id, reaction_code, reaction_version, category, response_delay_band, policy_digest, recorded_at, expires_at) VALUES (?, ?, 1, 'cafe', ?, ?, ?, ?)",
      )
      .bind(
        `reaction:${input.idempotencyDigest.slice(0, 48)}`,
        input.reaction,
        delayBand(input.now - consumed.due_at),
        FEEDBACK_POLICY_DIGEST,
        input.now,
        input.now + 180 * DAY,
      )
      .run();
    await this.database
      .prepare(
        "INSERT INTO feedback_reaction_outcomes (capability_digest, idempotency_digest, request_digest, feedback_id, expires_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        input.capabilityDigest,
        input.idempotencyDigest,
        requestDigest,
        input.feedbackId,
        consumed.expires_at,
      )
      .run();
    return { feedbackId: input.feedbackId, kind: "recorded" };
  }

  private findOutcome(capabilityDigest: string): Promise<z.infer<typeof outcomeSchema> | null> {
    return firstParsed(
      this.database
        .prepare(
          "SELECT feedback_id, idempotency_digest, request_digest FROM feedback_reaction_outcomes WHERE capability_digest = ?",
        )
        .bind(capabilityDigest),
      outcomeSchema,
    );
  }
}

function delayBand(elapsedAfterDue: number): "one-hour" | "same-day" | "later" {
  if (elapsedAfterDue <= 60 * 60 * 1_000) {
    return "one-hour";
  }
  if (elapsedAfterDue <= DAY) {
    return "same-day";
  }
  return "later";
}
