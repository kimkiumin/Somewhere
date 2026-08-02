PRAGMA foreign_keys = ON;

CREATE TABLE v1_migration_marker (
  version INTEGER PRIMARY KEY CHECK (version = 1),
  applied_at INTEGER NOT NULL CHECK (applied_at > 0)
) STRICT;

INSERT INTO v1_migration_marker (version, applied_at) VALUES (1, 1);
