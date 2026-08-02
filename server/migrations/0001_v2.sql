PRAGMA foreign_keys = ON;

CREATE TABLE policy_versions (
  policy_id TEXT PRIMARY KEY CHECK (length(policy_id) BETWEEN 20 AND 96),
  policy_kind TEXT NOT NULL CHECK (policy_kind IN ('selection', 'evidence', 'retention', 'navigation', 'budget')),
  version INTEGER NOT NULL CHECK (version > 0),
  document_digest TEXT NOT NULL CHECK (length(document_digest) = 64 AND document_digest NOT GLOB '*[^0-9a-f]*'),
  effective_at INTEGER NOT NULL CHECK (effective_at > 0),
  retired_at INTEGER CHECK (retired_at IS NULL OR retired_at > effective_at),
  UNIQUE (policy_kind, version),
  UNIQUE (policy_kind, document_digest)
) STRICT;

CREATE TABLE canonical_venues (
  venue_id TEXT PRIMARY KEY CHECK (length(venue_id) BETWEEN 20 AND 96),
  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('active', 'retired', 'blocked')),
  record_version INTEGER NOT NULL CHECK (record_version > 0),
  record_digest TEXT NOT NULL CHECK (length(record_digest) = 64 AND record_digest NOT GLOB '*[^0-9a-f]*'),
  rights_expires_at INTEGER NOT NULL CHECK (rights_expires_at > 0),
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  UNIQUE (record_digest)
) STRICT;

CREATE TABLE venue_sources (
  source_id TEXT PRIMARY KEY CHECK (length(source_id) BETWEEN 20 AND 96),
  venue_id TEXT NOT NULL REFERENCES canonical_venues(venue_id) ON DELETE CASCADE,
  provider_code TEXT NOT NULL CHECK (length(provider_code) BETWEEN 1 AND 48),
  provider_reference_digest TEXT NOT NULL CHECK (length(provider_reference_digest) = 64 AND provider_reference_digest NOT GLOB '*[^0-9a-f]*'),
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  rights_expires_at INTEGER NOT NULL CHECK (rights_expires_at > 0),
  UNIQUE (provider_code, provider_reference_digest, source_version)
) STRICT;

CREATE TABLE place_evidence (
  evidence_id TEXT PRIMARY KEY CHECK (length(evidence_id) BETWEEN 20 AND 96),
  venue_id TEXT NOT NULL REFERENCES canonical_venues(venue_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES venue_sources(source_id) ON DELETE RESTRICT,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('category', 'hours', 'accessibility', 'safety', 'merit')),
  normalized_value TEXT NOT NULL CHECK (length(normalized_value) BETWEEN 1 AND 1024),
  confidence_basis_points INTEGER NOT NULL CHECK (confidence_basis_points BETWEEN 0 AND 10000),
  review_state TEXT NOT NULL CHECK (review_state IN ('approved', 'rejected', 'uncertain')),
  evidence_version INTEGER NOT NULL CHECK (evidence_version > 0),
  evidence_digest TEXT NOT NULL CHECK (length(evidence_digest) = 64 AND evidence_digest NOT GLOB '*[^0-9a-f]*'),
  reviewed_at INTEGER NOT NULL CHECK (reviewed_at > 0),
  evidence_expires_at INTEGER NOT NULL CHECK (evidence_expires_at > reviewed_at),
  UNIQUE (evidence_digest)
) STRICT;

CREATE TABLE qualified_pools (
  pool_id TEXT PRIMARY KEY CHECK (length(pool_id) BETWEEN 20 AND 96),
  policy_id TEXT NOT NULL REFERENCES policy_versions(policy_id) ON DELETE RESTRICT,
  pool_state TEXT NOT NULL CHECK (pool_state IN ('building', 'sealed', 'expired')),
  pool_version INTEGER NOT NULL CHECK (pool_version > 0),
  member_count INTEGER NOT NULL CHECK (member_count >= 0),
  pool_digest TEXT NOT NULL CHECK (length(pool_digest) = 64 AND pool_digest NOT GLOB '*[^0-9a-f]*'),
  sealed_at INTEGER,
  expires_at INTEGER NOT NULL CHECK (expires_at > 0),
  CHECK ((pool_state = 'building' AND sealed_at IS NULL) OR (pool_state IN ('sealed', 'expired') AND sealed_at IS NOT NULL)),
  UNIQUE (pool_digest)
) STRICT;

CREATE TABLE qualified_pool_members (
  pool_id TEXT NOT NULL REFERENCES qualified_pools(pool_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  venue_id TEXT NOT NULL REFERENCES canonical_venues(venue_id) ON DELETE RESTRICT,
  evidence_digest TEXT NOT NULL CHECK (length(evidence_digest) = 64 AND evidence_digest NOT GLOB '*[^0-9a-f]*'),
  member_digest TEXT NOT NULL CHECK (length(member_digest) = 64 AND member_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (pool_id, ordinal),
  UNIQUE (pool_id, venue_id),
  UNIQUE (pool_id, member_digest)
) STRICT;

CREATE TABLE selection_receipts (
  receipt_id TEXT PRIMARY KEY CHECK (length(receipt_id) BETWEEN 20 AND 96),
  pool_id TEXT NOT NULL REFERENCES qualified_pools(pool_id) ON DELETE RESTRICT,
  policy_digest TEXT NOT NULL CHECK (length(policy_digest) = 64 AND policy_digest NOT GLOB '*[^0-9a-f]*'),
  randomness_digest TEXT NOT NULL CHECK (length(randomness_digest) = 64 AND randomness_digest NOT GLOB '*[^0-9a-f]*'),
  constraint_digest TEXT NOT NULL CHECK (length(constraint_digest) = 64 AND constraint_digest NOT GLOB '*[^0-9a-f]*'),
  receipt_state TEXT NOT NULL CHECK (receipt_state IN ('prepared', 'activated', 'invalidated')),
  selected_member_digest TEXT CHECK (selected_member_digest IS NULL OR (length(selected_member_digest) = 64 AND selected_member_digest NOT GLOB '*[^0-9a-f]*')),
  receipt_version INTEGER NOT NULL CHECK (receipt_version > 0),
  prepared_at INTEGER NOT NULL CHECK (prepared_at > 0),
  activated_at INTEGER,
  expires_at INTEGER NOT NULL CHECK (expires_at > prepared_at),
  CHECK ((receipt_state = 'prepared' AND activated_at IS NULL) OR (receipt_state IN ('activated', 'invalidated') AND activated_at IS NOT NULL))
) STRICT;

CREATE TABLE selection_attempts (
  receipt_id TEXT NOT NULL REFERENCES selection_receipts(receipt_id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  remaining_set_digest TEXT NOT NULL CHECK (length(remaining_set_digest) = 64 AND remaining_set_digest NOT GLOB '*[^0-9a-f]*'),
  candidate_member_digest TEXT NOT NULL CHECK (length(candidate_member_digest) = 64 AND candidate_member_digest NOT GLOB '*[^0-9a-f]*'),
  validation_result TEXT NOT NULL CHECK (validation_result IN ('pending', 'accepted', 'rejected')),
  result_digest TEXT CHECK (result_digest IS NULL OR (length(result_digest) = 64 AND result_digest NOT GLOB '*[^0-9a-f]*')),
  attempted_at INTEGER NOT NULL CHECK (attempted_at > 0),
  PRIMARY KEY (receipt_id, attempt_number),
  CHECK ((validation_result = 'pending' AND result_digest IS NULL) OR (validation_result IN ('accepted', 'rejected') AND result_digest IS NOT NULL))
) STRICT;

CREATE TABLE browser_session_guards (
  session_binding_digest TEXT PRIMARY KEY CHECK (length(session_binding_digest) = 64 AND session_binding_digest NOT GLOB '*[^0-9a-f]*'),
  guard_version INTEGER NOT NULL CHECK (guard_version > 0),
  active_journey_digest TEXT CHECK (active_journey_digest IS NULL OR (length(active_journey_digest) = 64 AND active_journey_digest NOT GLOB '*[^0-9a-f]*')),
  create_request_digest TEXT CHECK (create_request_digest IS NULL OR (length(create_request_digest) = 64 AND create_request_digest NOT GLOB '*[^0-9a-f]*')),
  previous_candidate_digest TEXT CHECK (previous_candidate_digest IS NULL OR (length(previous_candidate_digest) = 64 AND previous_candidate_digest NOT GLOB '*[^0-9a-f]*')),
  recovery_capability_digest TEXT CHECK (recovery_capability_digest IS NULL OR (length(recovery_capability_digest) = 64 AND recovery_capability_digest NOT GLOB '*[^0-9a-f]*')),
  recovery_consumed_at INTEGER,
  last_stopped_at INTEGER,
  expires_at INTEGER NOT NULL CHECK (expires_at > 0)
) STRICT;

CREATE TABLE consent_ledger (
  consent_id TEXT PRIMARY KEY CHECK (length(consent_id) BETWEEN 20 AND 96),
  session_binding_digest TEXT NOT NULL CHECK (length(session_binding_digest) = 64 AND session_binding_digest NOT GLOB '*[^0-9a-f]*'),
  consent_kind TEXT NOT NULL CHECK (consent_kind IN ('location', 'feedback')),
  notice_version INTEGER NOT NULL CHECK (notice_version > 0),
  notice_digest TEXT NOT NULL CHECK (length(notice_digest) = 64 AND notice_digest NOT GLOB '*[^0-9a-f]*'),
  decision TEXT NOT NULL CHECK (decision IN ('granted', 'withdrawn')),
  decided_at INTEGER NOT NULL CHECK (decided_at > 0)
) STRICT;

CREATE TABLE feedback_eligibility (
  eligibility_id TEXT PRIMARY KEY CHECK (length(eligibility_id) BETWEEN 20 AND 96),
  journey_hmac_digest TEXT NOT NULL CHECK (length(journey_hmac_digest) = 64 AND journey_hmac_digest NOT GLOB '*[^0-9a-f]*'),
  capability_digest TEXT NOT NULL CHECK (length(capability_digest) = 64 AND capability_digest NOT GLOB '*[^0-9a-f]*'),
  eligibility_state TEXT NOT NULL CHECK (eligibility_state IN ('eligible', 'consumed', 'revoked', 'expired')),
  due_at INTEGER NOT NULL CHECK (due_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > due_at),
  consumed_at INTEGER,
  UNIQUE (capability_digest)
) STRICT;

CREATE TABLE place_reactions (
  reaction_id TEXT PRIMARY KEY CHECK (length(reaction_id) BETWEEN 20 AND 96),
  reaction_code TEXT NOT NULL CHECK (reaction_code IN ('positive', 'neutral', 'negative')),
  reaction_version INTEGER NOT NULL CHECK (reaction_version > 0),
  policy_digest TEXT NOT NULL CHECK (length(policy_digest) = 64 AND policy_digest NOT GLOB '*[^0-9a-f]*'),
  recorded_at INTEGER NOT NULL CHECK (recorded_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > recorded_at)
) STRICT;

CREATE TABLE audit_events (
  audit_event_id TEXT PRIMARY KEY CHECK (length(audit_event_id) BETWEEN 20 AND 96),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('system', 'operator', 'deployer')),
  action_code TEXT NOT NULL CHECK (length(action_code) BETWEEN 1 AND 64),
  result_code TEXT NOT NULL CHECK (length(result_code) BETWEEN 1 AND 64),
  policy_digest TEXT CHECK (policy_digest IS NULL OR (length(policy_digest) = 64 AND policy_digest NOT GLOB '*[^0-9a-f]*')),
  deploy_digest TEXT CHECK (deploy_digest IS NULL OR (length(deploy_digest) = 64 AND deploy_digest NOT GLOB '*[^0-9a-f]*')),
  occurred_at INTEGER NOT NULL CHECK (occurred_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > occurred_at)
) STRICT;

CREATE TABLE budget_windows (
  budget_window_id TEXT PRIMARY KEY CHECK (length(budget_window_id) BETWEEN 20 AND 96),
  meter_code TEXT NOT NULL CHECK (length(meter_code) BETWEEN 1 AND 48),
  window_start INTEGER NOT NULL CHECK (window_start > 0),
  window_end INTEGER NOT NULL CHECK (window_end > window_start),
  authority_digest TEXT NOT NULL CHECK (length(authority_digest) = 64 AND authority_digest NOT GLOB '*[^0-9a-f]*'),
  finalized_units INTEGER NOT NULL CHECK (finalized_units >= 0),
  UNIQUE (meter_code, window_start)
) STRICT;

CREATE TABLE budget_reservations (
  reservation_id TEXT PRIMARY KEY CHECK (length(reservation_id) BETWEEN 20 AND 96),
  budget_window_id TEXT NOT NULL REFERENCES budget_windows(budget_window_id) ON DELETE CASCADE,
  request_digest TEXT NOT NULL CHECK (length(request_digest) = 64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
  units INTEGER NOT NULL CHECK (units > 0),
  reservation_state TEXT NOT NULL CHECK (reservation_state IN ('outstanding', 'finalized', 'released')),
  reserved_at INTEGER NOT NULL CHECK (reserved_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > reserved_at),
  UNIQUE (budget_window_id, request_digest)
) STRICT;

CREATE TABLE inbox_events (
  event_id TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 20 AND 96),
  event_digest TEXT NOT NULL CHECK (length(event_digest) = 64 AND event_digest NOT GLOB '*[^0-9a-f]*'),
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 64),
  result_code TEXT NOT NULL CHECK (length(result_code) BETWEEN 1 AND 64),
  write_epoch INTEGER NOT NULL CHECK (write_epoch > 0),
  received_at INTEGER NOT NULL CHECK (received_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > received_at),
  UNIQUE (event_digest)
) STRICT;

CREATE TABLE outbox_events (
  event_id TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 20 AND 96),
  aggregate_digest TEXT NOT NULL CHECK (length(aggregate_digest) = 64 AND aggregate_digest NOT GLOB '*[^0-9a-f]*'),
  event_digest TEXT NOT NULL CHECK (length(event_digest) = 64 AND event_digest NOT GLOB '*[^0-9a-f]*'),
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 64),
  delivery_state TEXT NOT NULL CHECK (delivery_state IN ('pending', 'delivered', 'failed')),
  write_epoch INTEGER NOT NULL CHECK (write_epoch > 0),
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  acknowledged_at INTEGER,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  UNIQUE (event_digest)
) STRICT;

CREATE TABLE journey_tombstones (
  journey_hmac_digest TEXT PRIMARY KEY CHECK (length(journey_hmac_digest) = 64 AND journey_hmac_digest NOT GLOB '*[^0-9a-f]*'),
  delete_request_digest TEXT NOT NULL CHECK (length(delete_request_digest) = 64 AND delete_request_digest NOT GLOB '*[^0-9a-f]*'),
  terminal_type TEXT NOT NULL CHECK (terminal_type IN ('deleted', 'expired')),
  coarse_utc_bucket INTEGER NOT NULL CHECK (coarse_utc_bucket > 0),
  write_epoch INTEGER NOT NULL CHECK (write_epoch > 0),
  replay_status INTEGER NOT NULL CHECK (replay_status = 204),
  expires_at INTEGER NOT NULL CHECK (expires_at > coarse_utc_bucket)
) STRICT;

CREATE INDEX idx_venues_lifecycle_rights ON canonical_venues(lifecycle_state, rights_expires_at);
CREATE INDEX idx_evidence_candidate ON place_evidence(venue_id, review_state, evidence_expires_at);
CREATE INDEX idx_pool_state_expiry ON qualified_pools(pool_state, expires_at);
CREATE INDEX idx_pool_members_venue ON qualified_pool_members(venue_id, pool_id);
CREATE INDEX idx_receipts_state_expiry ON selection_receipts(receipt_state, expires_at);
CREATE INDEX idx_attempts_pending ON selection_attempts(validation_result, attempted_at);
CREATE INDEX idx_session_guard_active ON browser_session_guards(active_journey_digest, expires_at);
CREATE INDEX idx_session_guard_expiry ON browser_session_guards(expires_at);
CREATE INDEX idx_consent_session_kind ON consent_ledger(session_binding_digest, consent_kind, decided_at);
CREATE INDEX idx_feedback_due ON feedback_eligibility(eligibility_state, due_at, expires_at);
CREATE INDEX idx_reactions_expiry ON place_reactions(expires_at);
CREATE INDEX idx_audit_expiry ON audit_events(expires_at);
CREATE INDEX idx_budget_reservations_state ON budget_reservations(budget_window_id, reservation_state, expires_at);
CREATE INDEX idx_inbox_expiry ON inbox_events(expires_at);
CREATE INDEX idx_outbox_delivery ON outbox_events(delivery_state, created_at);
CREATE INDEX idx_tombstones_expiry ON journey_tombstones(expires_at);
