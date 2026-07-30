import { type Database, firstParsed } from "../db/database";
import { type FeedbackConsumeInput, type FeedbackReaction, outcomeSchema } from "./contracts";
import type { FeedbackEligibilityRepository } from "./eligibility-repository";

const DAY = 24 * 60 * 60 * 1_000;
const FEEDBACK_POLICY_DIGEST = "f".repeat(64);

export class FeedbackReactionRepository {
  constructor(
    private readonly database: Database,
    private readonly writeEpoch: number,
    private readonly eligibility: FeedbackEligibilityRepository,
  ) {}

  async consume(input: FeedbackConsumeInput): Promise<FeedbackReaction> {
    const requestDigest = input.requestDigest ?? input.idempotencyDigest;
    const prior = await this.findOutcome(input.capabilityDigest);
    if (prior !== null) {
      return prior.idempotency_digest === input.idempotencyDigest &&
        prior.request_digest === requestDigest
        ? { feedbackId: prior.feedback_id, kind: "replay" }
        : { kind: "idempotency_conflict" };
    }
    const eligibility = await this.eligibility.find(input.capabilityDigest);
    if (eligibility === null || eligibility.feedback_id !== input.feedbackId) {
      return { kind: "capability_invalid" };
    }
    if (eligibility.expires_at <= input.now) {
      await this.eligibility.expire(input.capabilityDigest, input.now);
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
        !(await this.eligibility.hasActiveConsent(eligibility.consent_binding_digest)))
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
          `UPDATE feedback_eligibility
           SET eligibility_state = 'consumed', consumed_at = ?, consumption_digest = ?, write_epoch = ?
           WHERE capability_digest = ? AND feedback_id = ? AND eligibility_state = 'eligible'
             AND due_at <= ? AND expires_at > ? AND consent_granted = 1 AND write_epoch <= ?
             AND NOT EXISTS (
               SELECT 1 FROM pending_delete_intents
               WHERE journey_hmac_digest = feedback_eligibility.journey_hmac_digest
             )
             AND NOT EXISTS (
               SELECT 1 FROM journey_tombstones
               WHERE journey_hmac_digest = feedback_eligibility.journey_hmac_digest
             )`,
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
             AND write_epoch = ?
             AND NOT EXISTS (
               SELECT 1 FROM pending_delete_intents
               WHERE journey_hmac_digest = feedback_eligibility.journey_hmac_digest
             )
             AND NOT EXISTS (
               SELECT 1 FROM journey_tombstones
               WHERE journey_hmac_digest = feedback_eligibility.journey_hmac_digest
             )`,
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
             AND write_epoch = ?
             AND NOT EXISTS (
               SELECT 1 FROM pending_delete_intents
               WHERE journey_hmac_digest = feedback_eligibility.journey_hmac_digest
             )
             AND NOT EXISTS (
               SELECT 1 FROM journey_tombstones
               WHERE journey_hmac_digest = feedback_eligibility.journey_hmac_digest
             )`,
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
    if (outcome === null) {
      return { kind: "capability_invalid" };
    }
    if (outcome.idempotency_digest !== input.idempotencyDigest) {
      return { kind: "idempotency_conflict" };
    }
    return { feedbackId: input.feedbackId, kind: "recorded" };
  }

  private findOutcome(capabilityDigest: string) {
    return firstParsed(
      this.database
        .prepare(
          `SELECT outcome.feedback_id, outcome.idempotency_digest, outcome.request_digest,
             outcome.write_epoch
           FROM feedback_reaction_outcomes AS outcome
           JOIN feedback_eligibility AS eligibility
             ON eligibility.capability_digest = outcome.capability_digest
           WHERE outcome.capability_digest = ?
             AND NOT EXISTS (
               SELECT 1 FROM pending_delete_intents
               WHERE journey_hmac_digest = eligibility.journey_hmac_digest
             )
             AND NOT EXISTS (
               SELECT 1 FROM journey_tombstones
               WHERE journey_hmac_digest = eligibility.journey_hmac_digest
             )`,
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
