DROP INDEX idx_pending_delete_expiry;
ALTER TABLE pending_delete_intents RENAME TO pending_delete_intents_v1;

CREATE TABLE pending_delete_intents (
  journey_hmac_digest TEXT PRIMARY KEY
    CHECK (length(journey_hmac_digest) = 64 AND journey_hmac_digest NOT GLOB '*[^0-9a-f]*'),
  delete_request_digest TEXT NOT NULL
    CHECK (length(delete_request_digest) = 64 AND delete_request_digest NOT GLOB '*[^0-9a-f]*'),
  session_binding_digest TEXT NOT NULL
    CHECK (length(session_binding_digest) = 64 AND session_binding_digest NOT GLOB '*[^0-9a-f]*'),
  audit_event_id TEXT NOT NULL UNIQUE
    CHECK (length(audit_event_id) BETWEEN 20 AND 96),
  expected_sequence INTEGER CHECK (expected_sequence IS NULL OR expected_sequence >= 0),
  stage TEXT NOT NULL
    CHECK (stage IN ('pending', 'fenced', 'tombstoned', 'object-deleted', 'cleaned')),
  requested_at INTEGER NOT NULL CHECK (requested_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > requested_at)
) STRICT;

INSERT INTO pending_delete_intents (
  journey_hmac_digest,
  delete_request_digest,
  session_binding_digest,
  audit_event_id,
  expected_sequence,
  stage,
  requested_at,
  expires_at
)
SELECT
  journey_hmac_digest,
  delete_request_digest,
  session_binding_digest,
  audit_event_id,
  NULL,
  stage,
  requested_at,
  expires_at
FROM pending_delete_intents_v1;

DROP TABLE pending_delete_intents_v1;
CREATE INDEX idx_pending_delete_expiry ON pending_delete_intents(expires_at);
