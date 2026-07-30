export function initializeJourneySqliteSchema(storage: DurableObjectStorage): void {
  const sql = storage.sql;
  sql.exec(
    "CREATE TABLE IF NOT EXISTS journey_state (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), payload TEXT NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS journey_outbox (event_id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL, next_attempt_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS journey_inbox (event_id TEXT PRIMARY KEY, payload TEXT NOT NULL, write_epoch INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
  );
  sql.exec(
    "CREATE INDEX IF NOT EXISTS journey_outbox_due ON journey_outbox(status, next_attempt_at, expires_at)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS journey_deletion_gate (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), delete_request_digest TEXT NOT NULL, expected_sequence INTEGER NOT NULL CHECK (expected_sequence >= 0))",
  );
}
