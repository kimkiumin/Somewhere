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
    write_epoch: z.number().int().positive(),
  })
  .strict()
  .readonly();

const outcomeSchema = z
  .object({
    feedback_id: z.string(),
    idempotency_digest: z.string().length(64),
    request_digest: z.string().length(64),
    write_epoch: z.number().int().positive(),
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
  constructor(
    private readonly database: Database,
    private readonly writeEpoch: number,
  ) {
    if (!Number.isInteger(writeEpoch) || writeEpoch < 1) {
      throw new RangeError("Feedback write epoch must be a positive integer");
    }
  }

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
        "INSERT OR IGNORE INTO feedback_eligibility (eligibility_id, journey_hmac_digest, capability_digest, eligibility_state, due_at, expires_at, consumed_at, feedback_id, prompt_version, consent_granted, consent_binding_digest, consumption_digest, write_epoch) VALUES (?, ?, ?, 'eligible', ?, ?, NULL, ?, 'feedback-prompt-v1', ?, ?, NULL, ?)",
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
        this.writeEpoch,
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
          "SELECT capability_digest, consent_binding_digest, consent_granted, consumed_at, consumption_digest, due_at, eligibility_state, expires_at, feedback_id, journey_hmac_digest, prompt_version, write_epoch FROM feedback_eligibility WHERE capability_digest = ?",
        )
        .bind(capabilityDigest),
      feedbackRowSchema,
    );
  }

  async expire(capabilityDigest: string, now: number): Promise<void> {
    await this.database
      .prepare(
        "UPDATE feedback_eligibility SET eligibility_state = 'expired', write_epoch = ? WHERE capability_digest = ? AND expires_at <= ? AND eligibility_state = 'eligible' AND write_epoch <= ?",
      )
      .bind(this.writeEpoch, capabilityDigest, now, this.writeEpoch)
      .run();
  }

  async revokeJourney(journeyDigest: string): Promise<void> {
    await this.database
      .prepare(
        "UPDATE feedback_eligibility SET eligibility_state = 'revoked', write_epoch = ? WHERE journey_hmac_digest = ? AND eligibility_state = 'eligible' AND write_epoch <= ?",
      )
      .bind(this.writeEpoch, journeyDigest, this.writeEpoch)
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
    if (eligibility.write_epoch > this.writeEpoch) {
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
    const batch = this.database.batch;
    if (batch === undefined) {
      throw new TypeError("Atomic feedback batch is unavailable");
    }
    await batch.call(this.database, [
      this.database
        .prepare(
          "UPDATE feedback_eligibility SET eligibility_state = 'consumed', consumed_at = ?, consumption_digest = ?, write_epoch = ? WHERE capability_digest = ? AND feedback_id = ? AND eligibility_state = 'eligible' AND due_at <= ? AND expires_at > ? AND consent_granted = 1 AND write_epoch <= ?",
        )
        .bind(
          input.now,
          input.idempotencyDigest,
          this.writeEpoch,
          input.capabilityDigest,
          input.feedbackId,
          input.now,
          input.now,
          this.writeEpoch,
        ),
      this.database
        .prepare(
          `INSERT OR IGNORE INTO place_reactions (
             reaction_id, reaction_code, reaction_version, category, response_delay_band,
             policy_digest, recorded_at, expires_at, write_epoch
           )
           SELECT ?, ?, 1, 'cafe', ?, ?, ?, ?, ?
           FROM feedback_eligibility
           WHERE capability_digest = ? AND feedback_id = ?
             AND eligibility_state = 'consumed' AND consumption_digest = ?
             AND write_epoch = ?`,
        )
        .bind(
          `reaction:${input.idempotencyDigest.slice(0, 48)}`,
          input.reaction,
          delayBand(input.now - eligibility.due_at),
          FEEDBACK_POLICY_DIGEST,
          input.now,
          input.now + 180 * DAY,
          this.writeEpoch,
          input.capabilityDigest,
          input.feedbackId,
          input.idempotencyDigest,
          this.writeEpoch,
        ),
      this.database
        .prepare(
          `INSERT OR IGNORE INTO feedback_reaction_outcomes (
             capability_digest, idempotency_digest, request_digest,
             feedback_id, expires_at, write_epoch
           )
           SELECT ?, ?, ?, ?, ?, ?
           FROM feedback_eligibility
           WHERE capability_digest = ? AND feedback_id = ?
             AND eligibility_state = 'consumed' AND consumption_digest = ?
             AND write_epoch = ?`,
        )
        .bind(
          input.capabilityDigest,
          input.idempotencyDigest,
          requestDigest,
          input.feedbackId,
          eligibility.expires_at,
          this.writeEpoch,
          input.capabilityDigest,
          input.feedbackId,
          input.idempotencyDigest,
          this.writeEpoch,
        ),
    ]);
    const outcome = await this.findOutcome(input.capabilityDigest);
    if (outcome?.idempotency_digest !== input.idempotencyDigest) {
      return { kind: "idempotency_conflict" };
    }
    return { feedbackId: input.feedbackId, kind: "recorded" };
  }

  private findOutcome(capabilityDigest: string): Promise<z.infer<typeof outcomeSchema> | null> {
    return firstParsed(
      this.database
        .prepare(
          "SELECT feedback_id, idempotency_digest, request_digest, write_epoch FROM feedback_reaction_outcomes WHERE capability_digest = ?",
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
