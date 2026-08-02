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
RESTORED_WRITE_EPOCH_BEFORE_FENCE="$(sqlite3 "$RESTORED_DB" \
  "SELECT write_epoch FROM operations_write_fence WHERE environment = 'local';")"
sqlite3 "$RESTORED_DB" \
  "UPDATE operations_write_fence SET write_epoch = 5, mode = 'OPEN';"

SOURCE_WRITE_EPOCH="$(sqlite3 "$SOURCE_DB" \
  "SELECT write_epoch FROM operations_write_fence WHERE environment = 'local';")"
RESTORED_WRITE_EPOCH="$(sqlite3 "$RESTORED_DB" \
  "SELECT write_epoch FROM operations_write_fence WHERE environment = 'local';")"
[[ "$SOURCE_WRITE_EPOCH" -eq 4 ]]
[[ "$RESTORED_WRITE_EPOCH_BEFORE_FENCE" -eq "$SOURCE_WRITE_EPOCH" ]]
[[ "$RESTORED_WRITE_EPOCH" -eq $((SOURCE_WRITE_EPOCH + 1)) ]]

if STALE_WRITE_ERROR="$(sqlite3 "$RESTORED_DB" \
  "INSERT INTO feedback_eligibility (
    eligibility_id, journey_hmac_digest, capability_digest, eligibility_state,
    due_at, expires_at, consumed_at, write_epoch
  ) VALUES (
    'eligibility_stale_restore', '$DIGEST_A', '$DIGEST_B', 'eligible',
    1, 2, NULL, $SOURCE_WRITE_EPOCH
  );" 2>&1)"; then
  printf 'TASK14_STALE_WRITE_ACCEPTED\n' >&2
  exit 1
fi
if [[ "$STALE_WRITE_ERROR" != *"stale feedback write epoch"* ]]; then
  printf 'TASK14_STALE_WRITE_UNEXPECTED_ERROR %s\n' "$STALE_WRITE_ERROR" >&2
  exit 1
fi
STALE_WRITE_ROWS="$(sqlite3 "$RESTORED_DB" \
  "SELECT COUNT(*) FROM feedback_eligibility WHERE eligibility_id = 'eligibility_stale_restore';")"
[[ "$STALE_WRITE_ROWS" -eq 0 ]]

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
CURRENT_LOCATION_DIGEST="$(printf '%s' "$ENCRYPTED_EXPORT" | sha256sum | cut -d' ' -f1)"
OVERDUE_LOCATION_DIGEST="$(printf '%s' "$OVERDUE_EXPORT" | sha256sum | cut -d' ' -f1)"
OVERDUE_EXPORT_ID="export_overdue_00000000001"
DELETE_RECEIPT_DIGEST="$(
  printf '%s' "$OVERDUE_EXPORT_ID:$OVERDUE_LOCATION_DIGEST:$NOW_MS" |
    sha256sum | cut -d' ' -f1
)"
cp "$ENCRYPTED_EXPORT" "$OVERDUE_EXPORT"
sqlite3 "$SOURCE_DB" <<SQL
INSERT INTO operations_export_inventory VALUES (
  'export_current_000000000001', '$SOURCE_DIGEST', '$CURRENT_LOCATION_DIGEST',
  $NOW_MS, $DELETE_AT, 'RETAINED', NULL, NULL
);
INSERT INTO operations_export_inventory VALUES (
  '$OVERDUE_EXPORT_ID', '$SOURCE_DIGEST', '$OVERDUE_LOCATION_DIGEST',
  1, 2592000001, 'RETAINED', NULL, NULL
);
INSERT INTO operations_restore_receipts VALUES (
  'restore_receipt_000000001', '$SOURCE_DIGEST', '$RESTORED_DIGEST',
  '$DIGEST_A', 5, $NOW_MS
);
SQL

OVERDUE_INVENTORY_ROWS="$(sqlite3 "$SOURCE_DB" \
  "SELECT COUNT(*) FROM operations_export_inventory
   WHERE export_id = '$OVERDUE_EXPORT_ID'
     AND governed_location_digest = '$OVERDUE_LOCATION_DIGEST'
     AND state = 'RETAINED' AND delete_at <= $NOW_MS;")"
[[ "$OVERDUE_INVENTORY_ROWS" -eq 1 && -f "$OVERDUE_EXPORT" ]]
find "$OVERDUE_EXPORT" -maxdepth 0 -type f -delete
if [[ -e "$OVERDUE_EXPORT" ]]; then
  printf 'TASK14_EXPORT_CLEANUP_FAILED\n' >&2
  exit 1
fi
DELETED_INVENTORY_ROWS="$(sqlite3 "$SOURCE_DB" \
  "UPDATE operations_export_inventory
   SET state = 'DELETED', deleted_at = $NOW_MS,
       deletion_receipt_digest = '$DELETE_RECEIPT_DIGEST'
   WHERE export_id = '$OVERDUE_EXPORT_ID'
     AND governed_location_digest = '$OVERDUE_LOCATION_DIGEST'
     AND state = 'RETAINED' AND delete_at <= $NOW_MS;
   SELECT changes();")"
[[ "$DELETED_INVENTORY_ROWS" -eq 1 ]]
BOUND_CLEANUP_RECEIPT="$(sqlite3 -separator '|' "$SOURCE_DB" \
  "SELECT export_id, governed_location_digest, deletion_receipt_digest, state
   FROM operations_export_inventory
   WHERE export_id = '$OVERDUE_EXPORT_ID';")"
[[ "$BOUND_CLEANUP_RECEIPT" == \
  "$OVERDUE_EXPORT_ID|$OVERDUE_LOCATION_DIGEST|$DELETE_RECEIPT_DIGEST|DELETED" ]]
printf '%s\n' \
  "drill_scope=local_executable_fixture" \
  "source_digest=$SOURCE_DIGEST" \
  "restored_digest=$RESTORED_DIGEST" \
  "source_write_epoch=$SOURCE_WRITE_EPOCH" \
  "restored_write_epoch_before_fence=$RESTORED_WRITE_EPOCH_BEFORE_FENCE" \
  "write_epoch=$RESTORED_WRITE_EPOCH" \
  "stale_write_rejected=true" \
  "tombstones_reapplied=true" \
  "policy_retention_days_enforced_in_drill=30" \
  "drill_current_inventory_delete_at=$DELETE_AT" \
  "overdue_fixture_cleanup=$BOUND_CLEANUP_RECEIPT|artifact_absent=true" \
  "inventory=$(sqlite3 -json "$SOURCE_DB" \
    "SELECT export_id, delete_at - cutover_at AS retention_ms, state, deleted_at IS NOT NULL AS has_deleted_at FROM operations_export_inventory ORDER BY export_id;")" \
  "restore_receipts=$(sqlite3 -json "$SOURCE_DB" \
    "SELECT receipt_id, restored_write_epoch FROM operations_restore_receipts;")" \
  "unmanaged_drill_copy_cleanup=trap" \
  > "$EVIDENCE_DIR/export-restore.txt"

jq -n \
  --arg sourceDigest "$SOURCE_DIGEST" \
  --arg restoredDigest "$RESTORED_DIGEST" \
  --arg retentionExportId "$OVERDUE_EXPORT_ID" \
  --arg retentionLocationDigest "$OVERDUE_LOCATION_DIGEST" \
  --arg deletionReceiptDigest "$DELETE_RECEIPT_DIGEST" \
  --argjson sourceWriteEpoch "$SOURCE_WRITE_EPOCH" \
  --argjson restoredWriteEpochBeforeFence "$RESTORED_WRITE_EPOCH_BEFORE_FENCE" \
  --argjson restoredWriteEpoch "$RESTORED_WRITE_EPOCH" \
  '{
    schemaVersion: 1,
    scope: "local-deterministic-sqlite-fixture",
    repositoryGate: "PASS",
    externalPitrGate: "BLOCK",
    sourceDigest: $sourceDigest,
    restoredDigest: $restoredDigest,
    writeEpoch: $restoredWriteEpoch,
    sourceWriteEpoch: $sourceWriteEpoch,
    restoredWriteEpochBeforeFence: $restoredWriteEpochBeforeFence,
    restoredWriteEpoch: $restoredWriteEpoch,
    staleWriteRejected: true,
    encryptedExportRestored: true,
    tombstonesReapplied: true,
    retentionCleanupExecuted: true,
    retentionCleanup: {
      exportId: $retentionExportId,
      locationDigest: $retentionLocationDigest,
      deletionReceiptDigest: $deletionReceiptDigest,
      inventoryState: "DELETED",
      artifactAbsent: true
    },
    proves: [
      "portable-encrypted-export",
      "content-digest-equivalence",
      "tombstone-reapplication",
      "write-epoch-fencing",
      "local-retention-cleanup"
    ],
    externalRequirements: [
      "cloudflare-d1-time-travel",
      "cloudflare-durable-object-pitr",
      "authorized-production-credentials"
    ]
  }' > "$EVIDENCE_DIR/local-recovery-scope.json"
