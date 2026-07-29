ALTER TABLE feedback_eligibility
  ADD COLUMN feedback_id TEXT NOT NULL DEFAULT 'fid_v1.AAAAAAAAAAAAAAAAAAAAAA';
ALTER TABLE feedback_eligibility
  ADD COLUMN prompt_version TEXT NOT NULL DEFAULT 'feedback-prompt-v1';
ALTER TABLE feedback_eligibility
  ADD COLUMN consent_granted INTEGER NOT NULL DEFAULT 1
  CHECK (consent_granted IN (0, 1));
ALTER TABLE feedback_eligibility
  ADD COLUMN consent_binding_digest TEXT
  CHECK (
    consent_binding_digest IS NULL OR
    (length(consent_binding_digest) = 64 AND consent_binding_digest NOT GLOB '*[^0-9a-f]*')
  );
ALTER TABLE feedback_eligibility
  ADD COLUMN consumption_digest TEXT
  CHECK (
    consumption_digest IS NULL OR
    (length(consumption_digest) = 64 AND consumption_digest NOT GLOB '*[^0-9a-f]*')
  );

CREATE UNIQUE INDEX idx_feedback_id ON feedback_eligibility(feedback_id);

ALTER TABLE place_reactions RENAME TO place_reactions_v1;
CREATE TABLE place_reactions (
  reaction_id TEXT PRIMARY KEY CHECK (length(reaction_id) BETWEEN 20 AND 96),
  reaction_code TEXT NOT NULL
    CHECK (reaction_code IN ('dislike', 'like', 'love', 'did_not_visit')),
  reaction_version INTEGER NOT NULL CHECK (reaction_version > 0),
  category TEXT NOT NULL CHECK (category IN ('restaurant', 'cafe')),
  response_delay_band TEXT NOT NULL
    CHECK (response_delay_band IN ('one-hour', 'same-day', 'later')),
  policy_digest TEXT NOT NULL
    CHECK (length(policy_digest) = 64 AND policy_digest NOT GLOB '*[^0-9a-f]*'),
  recorded_at INTEGER NOT NULL CHECK (recorded_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > recorded_at)
) STRICT;
INSERT INTO place_reactions (
  reaction_id,
  reaction_code,
  reaction_version,
  category,
  response_delay_band,
  policy_digest,
  recorded_at,
  expires_at
)
SELECT
  reaction_id,
  CASE reaction_code
    WHEN 'positive' THEN 'like'
    WHEN 'negative' THEN 'dislike'
    ELSE 'did_not_visit'
  END,
  reaction_version,
  'cafe',
  'later',
  policy_digest,
  recorded_at,
  expires_at
FROM place_reactions_v1;
DROP TABLE place_reactions_v1;
CREATE INDEX idx_reactions_expiry ON place_reactions(expires_at);

CREATE TABLE feedback_reaction_outcomes (
  capability_digest TEXT PRIMARY KEY
    CHECK (length(capability_digest) = 64 AND capability_digest NOT GLOB '*[^0-9a-f]*'),
  idempotency_digest TEXT NOT NULL
    CHECK (length(idempotency_digest) = 64 AND idempotency_digest NOT GLOB '*[^0-9a-f]*'),
  request_digest TEXT NOT NULL
    CHECK (length(request_digest) = 64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
  feedback_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > 0)
) STRICT;

ALTER TABLE journey_tombstones
  ADD COLUMN replay_expires_at INTEGER NOT NULL DEFAULT 1
  CHECK (replay_expires_at > 0);

CREATE TABLE pending_delete_intents (
  journey_hmac_digest TEXT PRIMARY KEY
    CHECK (length(journey_hmac_digest) = 64 AND journey_hmac_digest NOT GLOB '*[^0-9a-f]*'),
  delete_request_digest TEXT NOT NULL
    CHECK (length(delete_request_digest) = 64 AND delete_request_digest NOT GLOB '*[^0-9a-f]*'),
  session_binding_digest TEXT NOT NULL
    CHECK (length(session_binding_digest) = 64 AND session_binding_digest NOT GLOB '*[^0-9a-f]*'),
  audit_event_id TEXT NOT NULL UNIQUE
    CHECK (length(audit_event_id) BETWEEN 20 AND 96),
  stage TEXT NOT NULL
    CHECK (stage IN ('pending', 'tombstoned', 'object-deleted', 'cleaned')),
  requested_at INTEGER NOT NULL CHECK (requested_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > requested_at)
) STRICT;
CREATE INDEX idx_pending_delete_expiry ON pending_delete_intents(expires_at);
