#!/usr/bin/env bash
set -euo pipefail

TASK_ROOT=""
cleanup() {
  if [[ -n "$TASK_ROOT" && -d "$TASK_ROOT" ]]; then
    find "$TASK_ROOT" -depth -mindepth 1 -delete
    rmdir "$TASK_ROOT"
  fi
}
trap cleanup EXIT

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_DIR="${1:?evidence directory required}"
mkdir -p "$EVIDENCE_DIR"
TASK_ROOT="$(mktemp -d)"
SOURCE_DB="$TASK_ROOT/source.sqlite"
RESTORED_DB="$TASK_ROOT/restored.sqlite"
PORTABLE_SQL="$TASK_ROOT/portable.sql"
ENCRYPTED_EXPORT="$TASK_ROOT/portable.sql.enc"
OVERDUE_EXPORT="$TASK_ROOT/overdue-portable.sql.enc"
DECRYPTED_SQL="$TASK_ROOT/decrypted.sql"
KEY_FILE="$TASK_ROOT/export.key"
TOMBSTONE_SQL="$TASK_ROOT/tombstone.sql"

for migration in "$REPO_ROOT"/server/migrations/*.sql; do
  sqlite3 "$SOURCE_DB" < "$migration"
done

DIGEST_A="$(printf 'a%.0s' {1..64})"
DIGEST_B="$(printf 'b%.0s' {1..64})"
sqlite3 "$SOURCE_DB" <<SQL
INSERT INTO operations_write_fence VALUES (
  'local', 4, 'RECOVERY_VERIFY', 'restore-drill', '$DIGEST_A', 1, NULL
);
INSERT INTO operations_meter_windows VALUES (
  'worker.dynamic_requests', 1, 86400001, 1, 1, 1, 1, 1, 0, 1, 1, '$DIGEST_A', 1, 259200001
);
SQL

sqlite3 "$SOURCE_DB" .dump > "$PORTABLE_SQL"
openssl rand -hex 32 > "$KEY_FILE"
openssl enc -aes-256-cbc -salt -pbkdf2 \
  -in "$PORTABLE_SQL" -out "$ENCRYPTED_EXPORT" -pass "file:$KEY_FILE"

sqlite3 "$SOURCE_DB" <<SQL
INSERT INTO journey_tombstones (
  journey_hmac_digest, delete_request_digest, terminal_type, coarse_utc_bucket,
  write_epoch, replay_status, expires_at, replay_expires_at
) VALUES ('$DIGEST_A', '$DIGEST_B', 'deleted', 2, 5, 204, 200, 200);
SQL
sqlite3 "$SOURCE_DB" \
  ".mode insert journey_tombstones" \
  "SELECT * FROM journey_tombstones;" \
  > "$TOMBSTONE_SQL"

openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "$ENCRYPTED_EXPORT" -out "$DECRYPTED_SQL" -pass "file:$KEY_FILE"
sqlite3 "$RESTORED_DB" < "$DECRYPTED_SQL"
sqlite3 "$RESTORED_DB" < "$TOMBSTONE_SQL"
sqlite3 "$RESTORED_DB" \
  "UPDATE operations_write_fence SET write_epoch = 5, mode = 'RECOVERY_VERIFY';"

SOURCE_DIGEST="$(
  sqlite3 -json "$SOURCE_DB" \
    "SELECT * FROM operations_meter_windows; SELECT * FROM journey_tombstones;" |
    sha256sum | cut -d' ' -f1
)"
RESTORED_DIGEST="$(
  sqlite3 -json "$RESTORED_DB" \
    "SELECT * FROM operations_meter_windows; SELECT * FROM journey_tombstones;" |
    sha256sum | cut -d' ' -f1
)"
if [[ "$SOURCE_DIGEST" != "$RESTORED_DIGEST" ]]; then
  printf 'TASK14-RESTORE-DIGEST mismatch\n' >&2
  exit 1
fi

NOW_MS="$(bun -e 'process.stdout.write(String(Date.now()))')"
DELETE_AT="$((NOW_MS + 2592000000))"
LOCATION_DIGEST="$(printf 'c%.0s' {1..64})"
DELETE_RECEIPT_DIGEST="$(printf 'd%.0s' {1..64})"
sqlite3 "$SOURCE_DB" <<SQL
INSERT INTO operations_export_inventory VALUES (
  'export_current_000000000001', '$SOURCE_DIGEST', '$LOCATION_DIGEST',
  $NOW_MS, $DELETE_AT, 'RETAINED', NULL, NULL
);
INSERT INTO operations_export_inventory VALUES (
  'export_overdue_00000000001', '$SOURCE_DIGEST', '$LOCATION_DIGEST',
  1, 2592000001, 'RETAINED', NULL, NULL
);
UPDATE operations_export_inventory
SET state = 'DELETED', deleted_at = $NOW_MS,
    deletion_receipt_digest = '$DELETE_RECEIPT_DIGEST'
WHERE export_id = 'export_overdue_00000000001' AND delete_at <= $NOW_MS;
INSERT INTO operations_restore_receipts VALUES (
  'restore_receipt_000000001', '$SOURCE_DIGEST', '$RESTORED_DIGEST',
  '$DIGEST_A', 5, $NOW_MS
);
SQL

cp "$ENCRYPTED_EXPORT" "$OVERDUE_EXPORT"
find "$OVERDUE_EXPORT" -delete
if [[ -e "$OVERDUE_EXPORT" ]]; then
  printf 'TASK14_EXPORT_CLEANUP_FAILED\n' >&2
  exit 1
fi
printf '%s\n' \
  "drill_scope=local_executable_fixture" \
  "source_digest=$SOURCE_DIGEST" \
  "restored_digest=$RESTORED_DIGEST" \
  "write_epoch=5" \
  "tombstones_reapplied=true" \
  "policy_retention_days_enforced_in_drill=30" \
  "drill_current_inventory_delete_at=$DELETE_AT" \
  "overdue_fixture_cleanup=true" \
  "inventory=$(sqlite3 -json "$SOURCE_DB" \
    "SELECT export_id, delete_at - cutover_at AS retention_ms, state, deleted_at IS NOT NULL AS has_deleted_at FROM operations_export_inventory ORDER BY export_id;")" \
  "restore_receipts=$(sqlite3 -json "$SOURCE_DB" \
    "SELECT receipt_id, restored_write_epoch FROM operations_restore_receipts;")" \
  "unmanaged_drill_copy_cleanup=trap" \
  > "$EVIDENCE_DIR/export-restore.txt"
