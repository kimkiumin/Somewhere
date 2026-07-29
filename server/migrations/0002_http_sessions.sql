CREATE TABLE http_runtime_keys (
  key_name TEXT PRIMARY KEY,
  key_material TEXT NOT NULL CHECK (length(key_material) = 43)
) STRICT;

CREATE TABLE http_sessions (
  binding_digest TEXT PRIMARY KEY CHECK (length(binding_digest) = 64),
  csrf_digest TEXT NOT NULL CHECK (length(csrf_digest) = 64),
  csrf_expires_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_http_sessions_expiry ON http_sessions(expires_at);
