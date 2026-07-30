import type { Database, PreparedQuery } from "../db/database";
import type { PendingDelete } from "./intent-repository";

export class GuardCleanupRepository {
  constructor(private readonly database: Database) {}

  statements(intent: PendingDelete): readonly PreparedQuery[] {
    return [
      this.database
        .prepare(
          `DELETE FROM browser_session_guards
           WHERE session_binding_digest = ?
             AND (
               active_journey_digest = ?
               OR (
                 active_journey_digest IS NULL
                 AND (
                   create_request_digest IS NOT NULL
                   OR previous_candidate_digest IS NOT NULL
                   OR recovery_capability_digest IS NOT NULL
                   OR recovery_consumed_at IS NOT NULL
                   OR last_stopped_at IS NOT NULL
                 )
                 AND (last_stopped_at IS NULL OR last_stopped_at <= ?)
               )
             )
             AND EXISTS (
               SELECT 1 FROM pending_delete_intents
               WHERE journey_hmac_digest = ? AND delete_request_digest = ?
                 AND session_binding_digest = ? AND audit_event_id = ?
                 AND stage = 'object-deleted'
             )`,
        )
        .bind(
          intent.session_binding_digest,
          intent.journey_hmac_digest,
          intent.requested_at,
          intent.journey_hmac_digest,
          intent.delete_request_digest,
          intent.session_binding_digest,
          intent.audit_event_id,
        ),
      this.database
        .prepare(
          `UPDATE browser_session_guards
           SET guard_version = guard_version + 1,
             previous_candidate_digest = NULL,
             recovery_capability_digest = NULL,
             recovery_consumed_at = NULL,
             last_stopped_at = NULL
           WHERE session_binding_digest = ?
             AND (active_journey_digest IS NOT NULL OR create_request_digest IS NOT NULL)
             AND (
               previous_candidate_digest IS NOT NULL
               OR recovery_capability_digest IS NOT NULL
               OR recovery_consumed_at IS NOT NULL
               OR last_stopped_at IS NOT NULL
             )
             AND (last_stopped_at IS NULL OR last_stopped_at <= ?)
             AND EXISTS (
               SELECT 1 FROM pending_delete_intents
               WHERE journey_hmac_digest = ? AND delete_request_digest = ?
                 AND session_binding_digest = ? AND audit_event_id = ?
                 AND stage = 'object-deleted'
             )`,
        )
        .bind(
          intent.session_binding_digest,
          intent.requested_at,
          intent.journey_hmac_digest,
          intent.delete_request_digest,
          intent.session_binding_digest,
          intent.audit_event_id,
        ),
    ];
  }
}
