import { z } from "zod";
import { type FeedbackReaction, FeedbackRepository } from "../feedback/repository";
import { type Database, firstParsed, parseBoundary } from "./database";
import { opaqueIdSchema, positiveIntegerSchema, sha256DigestSchema } from "./values";

const sessionGuardSchema = z
  .object({
    session_binding_digest: sha256DigestSchema,
    guard_version: positiveIntegerSchema,
    active_journey_digest: sha256DigestSchema.nullable(),
    create_request_digest: sha256DigestSchema.nullable(),
    previous_candidate_digest: sha256DigestSchema.nullable(),
    recovery_capability_digest: sha256DigestSchema.nullable(),
    recovery_consumed_at: positiveIntegerSchema.nullable(),
    last_stopped_at: positiveIntegerSchema.nullable(),
    expires_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

const consentSchema = z
  .object({
    consent_id: opaqueIdSchema,
    session_binding_digest: sha256DigestSchema,
    consent_kind: z.enum(["location", "feedback"]),
    notice_version: positiveIntegerSchema,
    notice_digest: sha256DigestSchema,
    decision: z.enum(["granted", "withdrawn"]),
    decided_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

const eligibilitySchema = z
  .object({
    eligibility_id: opaqueIdSchema,
    journey_hmac_digest: sha256DigestSchema,
    capability_digest: sha256DigestSchema,
    eligibility_state: z.enum(["eligible", "consumed", "revoked", "expired"]),
    due_at: positiveIntegerSchema,
    expires_at: positiveIntegerSchema,
    consumed_at: positiveIntegerSchema.nullable(),
  })
  .strict()
  .readonly();

const reactionSchema = z
  .object({
    reaction_id: opaqueIdSchema,
    reaction_code: z.enum(["positive", "neutral", "negative"]),
    reaction_version: positiveIntegerSchema,
    policy_digest: sha256DigestSchema,
    recorded_at: positiveIntegerSchema,
    expires_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

export type SessionGuardRecord = z.infer<typeof sessionGuardSchema>;
export type ConsentRecord = z.infer<typeof consentSchema>;
export type FeedbackEligibilityRecord = z.infer<typeof eligibilitySchema>;
export type ReactionRecord = z.infer<typeof reactionSchema>;

export class SessionRepository {
  constructor(
    private readonly database: Database,
    private readonly writeEpoch: number,
  ) {}

  async putGuard(value: unknown): Promise<SessionGuardRecord> {
    const record = parseBoundary(sessionGuardSchema, value);
    await this.database
      .prepare(
        "INSERT INTO browser_session_guards (session_binding_digest, guard_version, active_journey_digest, create_request_digest, previous_candidate_digest, recovery_capability_digest, recovery_consumed_at, last_stopped_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_binding_digest) DO UPDATE SET guard_version = excluded.guard_version, active_journey_digest = excluded.active_journey_digest, create_request_digest = excluded.create_request_digest, previous_candidate_digest = excluded.previous_candidate_digest, recovery_capability_digest = excluded.recovery_capability_digest, recovery_consumed_at = excluded.recovery_consumed_at, last_stopped_at = excluded.last_stopped_at, expires_at = excluded.expires_at WHERE excluded.guard_version > browser_session_guards.guard_version",
      )
      .bind(
        record.session_binding_digest,
        record.guard_version,
        record.active_journey_digest,
        record.create_request_digest,
        record.previous_candidate_digest,
        record.recovery_capability_digest,
        record.recovery_consumed_at,
        record.last_stopped_at,
        record.expires_at,
      )
      .run();
    return record;
  }

  findGuard(bindingDigest: string, now: number): Promise<SessionGuardRecord | null> {
    return firstParsed(
      this.database
        .prepare(
          "SELECT session_binding_digest, guard_version, active_journey_digest, create_request_digest, previous_candidate_digest, recovery_capability_digest, recovery_consumed_at, last_stopped_at, expires_at FROM browser_session_guards WHERE session_binding_digest = ? AND expires_at > ?",
        )
        .bind(bindingDigest, now),
      sessionGuardSchema,
    );
  }

  async appendConsent(value: unknown): Promise<ConsentRecord> {
    const record = parseBoundary(consentSchema, value);
    await this.database
      .prepare(
        "INSERT INTO consent_ledger (consent_id, session_binding_digest, consent_kind, notice_version, notice_digest, decision, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.consent_id,
        record.session_binding_digest,
        record.consent_kind,
        record.notice_version,
        record.notice_digest,
        record.decision,
        record.decided_at,
      )
      .run();
    return record;
  }

  async insertFeedbackEligibility(value: unknown): Promise<FeedbackEligibilityRecord> {
    const record = parseBoundary(eligibilitySchema, value);
    await this.database
      .prepare(
        "INSERT INTO feedback_eligibility (eligibility_id, journey_hmac_digest, capability_digest, eligibility_state, due_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.eligibility_id,
        record.journey_hmac_digest,
        record.capability_digest,
        record.eligibility_state,
        record.due_at,
        record.expires_at,
        record.consumed_at,
      )
      .run();
    return record;
  }

  async insertReaction(value: unknown): Promise<ReactionRecord> {
    const record = parseBoundary(reactionSchema, value);
    await this.database
      .prepare(
        "INSERT INTO place_reactions (reaction_id, reaction_code, reaction_version, policy_digest, recorded_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.reaction_id,
        record.reaction_code,
        record.reaction_version,
        record.policy_digest,
        record.recorded_at,
        record.expires_at,
      )
      .run();
    return record;
  }

  consumeFeedback(
    input: Readonly<{
      capabilityDigest: string;
      feedbackId: string;
      idempotencyDigest: string;
      now: number;
      reaction: "dislike" | "like" | "love" | "did_not_visit";
    }>,
  ): Promise<FeedbackReaction> {
    return new FeedbackRepository(this.database, this.writeEpoch).consume(input);
  }
}
