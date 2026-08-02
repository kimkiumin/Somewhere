import { z } from "zod";
import { type Database, firstParsed } from "../db/database";
import { type FeedbackEligibility, type FeedbackIssueInput, feedbackRowSchema } from "./contracts";

export class FeedbackEligibilityRepository {
  constructor(
    private readonly database: Database,
    private readonly writeEpoch: number,
  ) {}

  async issue(input: FeedbackIssueInput): Promise<boolean> {
    const result = await this.database
      .prepare(
        `INSERT OR IGNORE INTO feedback_eligibility (
          eligibility_id, journey_hmac_digest, capability_digest, eligibility_state,
          due_at, expires_at, consumed_at, feedback_id, prompt_version, consent_granted,
          consent_binding_digest, consumption_digest, write_epoch
        )
        SELECT ?, ?, ?, 'eligible', ?, ?, NULL, ?, 'feedback-prompt-v1', ?, ?, NULL, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM pending_delete_intents WHERE journey_hmac_digest = ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM journey_tombstones WHERE journey_hmac_digest = ?
        )`,
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
        input.journeyDigest,
        input.journeyDigest,
      )
      .run();
    if (mutationChanges(result) === 1) {
      return true;
    }
    const available = await this.database
      .prepare(
        `SELECT 1 AS available
         FROM feedback_eligibility
         WHERE capability_digest = ? AND feedback_id = ? AND journey_hmac_digest = ?
           AND NOT EXISTS (
             SELECT 1 FROM pending_delete_intents WHERE journey_hmac_digest = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM journey_tombstones WHERE journey_hmac_digest = ?
           )`,
      )
      .bind(
        input.capabilityDigest,
        input.feedbackId,
        input.journeyDigest,
        input.journeyDigest,
        input.journeyDigest,
      )
      .first();
    return available !== null;
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
}

function mutationChanges(result: unknown): number | undefined {
  if (
    typeof result !== "object" ||
    result === null ||
    !("meta" in result) ||
    typeof result.meta !== "object" ||
    result.meta === null ||
    !("changes" in result.meta) ||
    typeof result.meta.changes !== "number"
  ) {
    return undefined;
  }
  return result.meta.changes;
}
