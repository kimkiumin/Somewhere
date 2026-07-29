PRAGMA foreign_keys = ON;

CREATE TABLE operations_write_fence (
  environment TEXT PRIMARY KEY
    CHECK (environment IN ('local', 'staging', 'production')),
  write_epoch INTEGER NOT NULL CHECK (write_epoch > 0),
  mode TEXT NOT NULL
    CHECK (
      mode IN (
        'OPEN',
        'ADMISSION_CLOSED',
        'PRODUCERS_FENCED',
        'ALL_NONTERMINAL_FENCED',
        'RECOVERY_VERIFY'
      )
    ),
  reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 64),
  change_digest TEXT NOT NULL
    CHECK (length(change_digest) = 64 AND change_digest NOT GLOB '*[^0-9a-f]*'),
  raised_at INTEGER NOT NULL CHECK (raised_at > 0),
  expires_at INTEGER CHECK (expires_at IS NULL OR expires_at > raised_at)
) STRICT;

CREATE TABLE operations_meter_windows (
  meter_id TEXT NOT NULL CHECK (length(meter_id) BETWEEN 3 AND 64),
  window_start_utc INTEGER NOT NULL CHECK (window_start_utc > 0),
  window_end_utc INTEGER NOT NULL CHECK (window_end_utc > window_start_utc),
  platform_observed INTEGER CHECK (platform_observed IS NULL OR platform_observed >= 0),
  platform_observed_at INTEGER,
  immediate_observed INTEGER CHECK (immediate_observed IS NULL OR immediate_observed >= 0),
  immediate_observed_at INTEGER,
  local_finalized INTEGER NOT NULL DEFAULT 0 CHECK (local_finalized >= 0),
  unrelated_baseline INTEGER NOT NULL CHECK (unrelated_baseline >= 0),
  uncertainty_reserve INTEGER NOT NULL CHECK (uncertainty_reserve >= 0),
  reset_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (reset_confirmed IN (0, 1)),
  authority_digest TEXT NOT NULL
    CHECK (length(authority_digest) = 64 AND authority_digest NOT GLOB '*[^0-9a-f]*'),
  updated_at INTEGER NOT NULL CHECK (updated_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at >= window_end_utc + 172800000),
  PRIMARY KEY (meter_id, window_start_utc),
  CHECK (
    (platform_observed IS NULL AND platform_observed_at IS NULL) OR
    (platform_observed IS NOT NULL AND platform_observed_at IS NOT NULL)
  ),
  CHECK (
    (immediate_observed IS NULL AND immediate_observed_at IS NULL) OR
    (immediate_observed IS NOT NULL AND immediate_observed_at IS NOT NULL)
  )
) STRICT;

CREATE TABLE operations_meter_reservations (
  reservation_id TEXT PRIMARY KEY CHECK (length(reservation_id) BETWEEN 20 AND 96),
  meter_id TEXT NOT NULL,
  window_start_utc INTEGER NOT NULL,
  request_digest TEXT NOT NULL
    CHECK (length(request_digest) = 64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
  release_digest TEXT NOT NULL
    CHECK (length(release_digest) = 64 AND release_digest NOT GLOB '*[^0-9a-f]*'),
  provider_digest TEXT
    CHECK (
      provider_digest IS NULL OR
      (length(provider_digest) = 64 AND provider_digest NOT GLOB '*[^0-9a-f]*')
    ),
  write_epoch INTEGER NOT NULL CHECK (write_epoch > 0),
  reserved_units INTEGER NOT NULL CHECK (reserved_units > 0),
  finalized_units INTEGER CHECK (finalized_units IS NULL OR finalized_units >= 0),
  reservation_state TEXT NOT NULL
    CHECK (reservation_state IN ('reserved', 'finalized', 'released')),
  reserved_at INTEGER NOT NULL CHECK (reserved_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > reserved_at),
  FOREIGN KEY (meter_id, window_start_utc)
    REFERENCES operations_meter_windows(meter_id, window_start_utc)
    ON DELETE CASCADE,
  UNIQUE (meter_id, window_start_utc, request_digest, release_digest),
  CHECK (
    (reservation_state = 'finalized' AND finalized_units IS NOT NULL) OR
    (reservation_state IN ('reserved', 'released') AND finalized_units IS NULL)
  )
) STRICT;

CREATE TABLE operations_journey_envelopes (
  release_digest TEXT NOT NULL
    CHECK (length(release_digest) = 64 AND release_digest NOT GLOB '*[^0-9a-f]*'),
  meter_id TEXT NOT NULL CHECK (length(meter_id) BETWEEN 3 AND 64),
  reserved_units INTEGER NOT NULL CHECK (reserved_units > 0),
  close_at REAL NOT NULL CHECK (close_at > 0),
  freshness_ms INTEGER NOT NULL CHECK (freshness_ms > 0),
  reset_confirmation_required INTEGER NOT NULL
    CHECK (reset_confirmation_required IN (0, 1)),
  envelope_digest TEXT NOT NULL
    CHECK (length(envelope_digest) = 64 AND envelope_digest NOT GLOB '*[^0-9a-f]*'),
  reviewed_at INTEGER NOT NULL CHECK (reviewed_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > reviewed_at),
  PRIMARY KEY (release_digest, meter_id)
) STRICT;

CREATE TABLE operations_kill_switches (
  scope_kind TEXT NOT NULL
    CHECK (scope_kind IN ('global', 'provider', 'field', 'venue', 'policy')),
  scope_digest TEXT NOT NULL
    CHECK (length(scope_digest) = 64 AND scope_digest NOT GLOB '*[^0-9a-f]*'),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 64),
  write_epoch INTEGER NOT NULL CHECK (write_epoch > 0),
  updated_at INTEGER NOT NULL CHECK (updated_at > 0),
  PRIMARY KEY (scope_kind, scope_digest)
) STRICT;

CREATE TABLE operations_admission_state (
  environment TEXT PRIMARY KEY
    CHECK (environment IN ('staging', 'production')),
  state TEXT NOT NULL
    CHECK (
      state IN (
        'BOOT_BLOCKED',
        'OPEN',
        'WARN',
        'METER_BLOCK',
        'EXTERNAL_BLOCK',
        'WRITE_FENCED',
        'DEGRADED',
        'EMERGENCY_FROZEN',
        'RECOVERY_VERIFY'
      )
    ),
  write_epoch INTEGER NOT NULL CHECK (write_epoch > 0),
  release_digest TEXT NOT NULL
    CHECK (length(release_digest) = 64 AND release_digest NOT GLOB '*[^0-9a-f]*'),
  provider_budget_available INTEGER NOT NULL
    CHECK (provider_budget_available IN (0, 1)),
  queue_healthy INTEGER NOT NULL CHECK (queue_healthy IN (0, 1)),
  fresh_recovery_samples INTEGER NOT NULL CHECK (fresh_recovery_samples >= 0),
  old_epoch_reservations INTEGER NOT NULL CHECK (old_epoch_reservations >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at > 0)
) STRICT;

CREATE TABLE operations_verified_legal_artifacts (
  environment TEXT NOT NULL CHECK (environment IN ('staging', 'production')),
  gate_kind TEXT NOT NULL CHECK (gate_kind IN ('provider-rights', 'korea-review')),
  reviewed_release_digest TEXT NOT NULL
    CHECK (
      length(reviewed_release_digest) = 64 AND
      reviewed_release_digest NOT GLOB '*[^0-9a-f]*'
    ),
  subject_digest TEXT NOT NULL
    CHECK (length(subject_digest) = 64 AND subject_digest NOT GLOB '*[^0-9a-f]*'),
  artifact_digest TEXT NOT NULL
    CHECK (length(artifact_digest) = 64 AND artifact_digest NOT GLOB '*[^0-9a-f]*'),
  verification_digest TEXT NOT NULL
    CHECK (length(verification_digest) = 64 AND verification_digest NOT GLOB '*[^0-9a-f]*'),
  failed_rule_ids_json TEXT NOT NULL CHECK (json_valid(failed_rule_ids_json)),
  evaluated_at INTEGER NOT NULL CHECK (evaluated_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > evaluated_at),
  PRIMARY KEY (environment, gate_kind, reviewed_release_digest, artifact_digest)
) STRICT;

CREATE TABLE operations_release_gates (
  environment TEXT NOT NULL CHECK (environment IN ('staging', 'production')),
  gate_kind TEXT NOT NULL CHECK (gate_kind IN ('provider-rights', 'korea-review')),
  subject_digest TEXT NOT NULL
    CHECK (length(subject_digest) = 64 AND subject_digest NOT GLOB '*[^0-9a-f]*'),
  verdict TEXT NOT NULL CHECK (verdict IN ('PASS', 'BLOCK')),
  reviewed_release_digest TEXT NOT NULL
    CHECK (
      length(reviewed_release_digest) = 64 AND
      reviewed_release_digest NOT GLOB '*[^0-9a-f]*'
    ),
  artifact_digest TEXT NOT NULL
    CHECK (length(artifact_digest) = 64 AND artifact_digest NOT GLOB '*[^0-9a-f]*'),
  failed_rule_ids_json TEXT NOT NULL CHECK (json_valid(failed_rule_ids_json)),
  evaluated_at INTEGER NOT NULL CHECK (evaluated_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > evaluated_at),
  PRIMARY KEY (environment, gate_kind, subject_digest)
) STRICT;

CREATE TRIGGER operations_verified_legal_artifact_gate
AFTER INSERT ON operations_verified_legal_artifacts
BEGIN
  INSERT INTO operations_release_gates (
    environment, gate_kind, subject_digest, verdict, reviewed_release_digest,
    artifact_digest, failed_rule_ids_json, evaluated_at, expires_at
  )
  SELECT
    admission.environment,
    NEW.gate_kind,
    NEW.subject_digest,
    'PASS',
    NEW.reviewed_release_digest,
    NEW.artifact_digest,
    NEW.failed_rule_ids_json,
    NEW.evaluated_at,
    NEW.expires_at
  FROM operations_admission_state AS admission
  WHERE admission.environment = NEW.environment
    AND admission.release_digest = NEW.reviewed_release_digest
  ON CONFLICT(environment, gate_kind, subject_digest) DO UPDATE SET
    verdict = excluded.verdict,
    reviewed_release_digest = excluded.reviewed_release_digest,
    artifact_digest = excluded.artifact_digest,
    failed_rule_ids_json = excluded.failed_rule_ids_json,
    evaluated_at = excluded.evaluated_at,
    expires_at = excluded.expires_at;
END;

CREATE TRIGGER operations_reject_unverified_legal_pass
BEFORE INSERT ON operations_release_gates
WHEN NEW.verdict = 'PASS' AND NOT EXISTS (
  SELECT 1 FROM operations_verified_legal_artifacts AS artifact
  WHERE artifact.environment = NEW.environment
    AND artifact.gate_kind = NEW.gate_kind
    AND artifact.reviewed_release_digest = NEW.reviewed_release_digest
    AND artifact.artifact_digest = NEW.artifact_digest
)
BEGIN
  SELECT RAISE(ABORT, 'unverified legal PASS');
END;

CREATE TRIGGER operations_reject_unverified_legal_pass_update
BEFORE UPDATE OF verdict, reviewed_release_digest, artifact_digest
ON operations_release_gates
WHEN NEW.verdict = 'PASS' AND NOT EXISTS (
  SELECT 1 FROM operations_verified_legal_artifacts AS artifact
  WHERE artifact.environment = NEW.environment
    AND artifact.gate_kind = NEW.gate_kind
    AND artifact.reviewed_release_digest = NEW.reviewed_release_digest
    AND artifact.artifact_digest = NEW.artifact_digest
)
BEGIN
  SELECT RAISE(ABORT, 'unverified legal PASS');
END;

CREATE TABLE operations_postgres_decisions (
  decision_id TEXT PRIMARY KEY CHECK (length(decision_id) BETWEEN 20 AND 96),
  reviewed_release_digest TEXT NOT NULL
    CHECK (
      length(reviewed_release_digest) = 64 AND
      reviewed_release_digest NOT GLOB '*[^0-9a-f]*'
    ),
  decision TEXT NOT NULL CHECK (decision IN ('STAY_D1', 'PLAN_POSTGRES_CUTOVER')),
  trigger_facts_digest TEXT NOT NULL
    CHECK (length(trigger_facts_digest) = 64 AND trigger_facts_digest NOT GLOB '*[^0-9a-f]*'),
  reviewer_digest TEXT NOT NULL
    CHECK (length(reviewer_digest) = 64 AND reviewer_digest NOT GLOB '*[^0-9a-f]*'),
  policy_version TEXT NOT NULL CHECK (policy_version = 'postgres-trigger-v1'),
  decided_at INTEGER NOT NULL CHECK (decided_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at = decided_at + 15552000000)
) STRICT;

CREATE TABLE operations_authority_nonces (
  environment TEXT NOT NULL CHECK (environment IN ('staging', 'production')),
  key_id_digest TEXT NOT NULL
    CHECK (length(key_id_digest) = 64 AND key_id_digest NOT GLOB '*[^0-9a-f]*'),
  nonce_digest TEXT NOT NULL
    CHECK (length(nonce_digest) = 64 AND nonce_digest NOT GLOB '*[^0-9a-f]*'),
  received_at INTEGER NOT NULL CHECK (received_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at = received_at + 600000),
  PRIMARY KEY (environment, key_id_digest, nonce_digest)
) STRICT;

CREATE TABLE operations_authority_commands (
  environment TEXT NOT NULL CHECK (environment IN ('staging', 'production')),
  command_id TEXT NOT NULL CHECK (length(command_id) BETWEEN 20 AND 96),
  payload_digest TEXT NOT NULL
    CHECK (length(payload_digest) = 64 AND payload_digest NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPLIED', 'FAILED')),
  failure_code TEXT CHECK (failure_code IS NULL OR length(failure_code) BETWEEN 3 AND 48),
  captured_at INTEGER NOT NULL CHECK (captured_at > 0),
  applied_at INTEGER,
  expires_at INTEGER NOT NULL CHECK (expires_at = captured_at + 15552000000),
  PRIMARY KEY (environment, command_id),
  CHECK (
    (status = 'PENDING' AND applied_at IS NULL AND failure_code IS NULL) OR
    (status = 'APPLIED' AND applied_at IS NOT NULL AND failure_code IS NULL) OR
    (status = 'FAILED' AND applied_at IS NOT NULL AND failure_code IS NOT NULL)
  )
) STRICT;

CREATE TABLE operations_authority_failures (
  receipt_id TEXT PRIMARY KEY CHECK (length(receipt_id) = 64),
  environment TEXT NOT NULL CHECK (environment IN ('staging', 'production')),
  failure_code TEXT NOT NULL CHECK (length(failure_code) BETWEEN 3 AND 48),
  occurred_at INTEGER NOT NULL CHECK (occurred_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at = occurred_at + 604800000)
) STRICT;

CREATE TABLE operations_recovery_authorities (
  environment TEXT PRIMARY KEY CHECK (environment IN ('staging', 'production')),
  last_collection_at INTEGER NOT NULL CHECK (last_collection_at > 0)
) STRICT;

CREATE TABLE operations_export_inventory (
  export_id TEXT PRIMARY KEY CHECK (length(export_id) BETWEEN 20 AND 96),
  export_digest TEXT NOT NULL
    CHECK (length(export_digest) = 64 AND export_digest NOT GLOB '*[^0-9a-f]*'),
  governed_location_digest TEXT NOT NULL
    CHECK (
      length(governed_location_digest) = 64 AND
      governed_location_digest NOT GLOB '*[^0-9a-f]*'
    ),
  cutover_at INTEGER NOT NULL CHECK (cutover_at > 0),
  delete_at INTEGER NOT NULL CHECK (delete_at = cutover_at + 2592000000),
  state TEXT NOT NULL CHECK (state IN ('RETAINED', 'DELETED')),
  deleted_at INTEGER,
  deletion_receipt_digest TEXT
    CHECK (
      deletion_receipt_digest IS NULL OR
      (
        length(deletion_receipt_digest) = 64 AND
        deletion_receipt_digest NOT GLOB '*[^0-9a-f]*'
      )
    ),
  CHECK (
    (state = 'RETAINED' AND deleted_at IS NULL AND deletion_receipt_digest IS NULL) OR
    (state = 'DELETED' AND deleted_at >= delete_at AND deletion_receipt_digest IS NOT NULL)
  )
) STRICT;

CREATE TABLE operations_restore_receipts (
  receipt_id TEXT PRIMARY KEY CHECK (length(receipt_id) BETWEEN 20 AND 96),
  export_digest TEXT NOT NULL,
  restored_digest TEXT NOT NULL,
  tombstone_digest TEXT NOT NULL,
  restored_write_epoch INTEGER NOT NULL CHECK (restored_write_epoch > 0),
  executed_at INTEGER NOT NULL CHECK (executed_at > 0),
  CHECK (export_digest = restored_digest)
) STRICT;

CREATE TABLE operations_rollback_receipts (
  receipt_id TEXT PRIMARY KEY CHECK (length(receipt_id) BETWEEN 20 AND 96),
  target_release_digest TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('ALLOW_CODE_ONLY', 'BLOCK')),
  reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 3 AND 64),
  executed_at INTEGER NOT NULL CHECK (executed_at > 0)
) STRICT;

CREATE TABLE operations_health_rollups (
  bucket_start_utc INTEGER PRIMARY KEY CHECK (bucket_start_utc > 0),
  admission_state TEXT NOT NULL CHECK (length(admission_state) BETWEEN 3 AND 32),
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  blocked_count INTEGER NOT NULL CHECK (blocked_count >= 0),
  error_count INTEGER NOT NULL CHECK (error_count >= 0),
  latency_bucket_json TEXT NOT NULL CHECK (json_valid(latency_bucket_json)),
  expires_at INTEGER NOT NULL CHECK (expires_at >= bucket_start_utc + 604800000)
) STRICT;

CREATE INDEX idx_operations_meter_windows_expiry
  ON operations_meter_windows (expires_at);
CREATE INDEX idx_operations_journey_envelopes_expiry
  ON operations_journey_envelopes (expires_at);
CREATE INDEX idx_operations_reservations_outstanding
  ON operations_meter_reservations (
    meter_id,
    window_start_utc,
    reservation_state,
    expires_at
  );
CREATE INDEX idx_operations_kill_switches_active
  ON operations_kill_switches (active, scope_kind);
CREATE INDEX idx_operations_release_gates_expiry
  ON operations_release_gates (environment, gate_kind, verdict, expires_at);
CREATE INDEX idx_operations_health_rollups_expiry
  ON operations_health_rollups (expires_at);
CREATE INDEX idx_operations_authority_nonce_expiry
  ON operations_authority_nonces (expires_at);
CREATE INDEX idx_operations_authority_command_expiry
  ON operations_authority_commands (expires_at);
CREATE INDEX idx_operations_authority_failure_expiry
  ON operations_authority_failures (expires_at);

CREATE TRIGGER operations_finalize_reservation
AFTER UPDATE OF reservation_state ON operations_meter_reservations
WHEN OLD.reservation_state = 'reserved' AND NEW.reservation_state = 'finalized'
BEGIN
  UPDATE operations_meter_windows
  SET
    local_finalized = local_finalized + NEW.finalized_units,
    updated_at = MAX(updated_at, NEW.reserved_at)
  WHERE
    meter_id = NEW.meter_id AND
    window_start_utc = NEW.window_start_utc;
END;
