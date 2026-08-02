#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_DIR="${1:-/home/tjrgus/.somewhere-v2-evidence/task-14}"
TASK_ROOT="$(mktemp -d)"
cleanup() {
  find "$TASK_ROOT" -depth -mindepth 1 -delete
  rmdir "$TASK_ROOT"
}
trap cleanup EXIT
cd "$REPO_ROOT"
bun run test:server -- task14-operations -t TASK14-LIFECYCLE-ROLLBACK
sqlite3 "$TASK_ROOT/rollback.sqlite" < server/migrations/0004_operations_control.sql
NOW_MS="$(bun -e 'process.stdout.write(String(Date.now()))')"
DIGEST="$(printf 'a%.0s' {1..64})"
sqlite3 "$TASK_ROOT/rollback.sqlite" <<SQL
INSERT INTO operations_rollback_receipts VALUES (
  'rollback_receipt_block_001', '$DIGEST', 'BLOCK',
  'lifecycle-rollback-forbidden', $NOW_MS
);
INSERT INTO operations_rollback_receipts VALUES (
  'rollback_receipt_code_0001', '$DIGEST', 'ALLOW_CODE_ONLY',
  'compatible-code-only', $NOW_MS
);
SQL
mkdir -p "$EVIDENCE_DIR"
sqlite3 -json "$TASK_ROOT/rollback.sqlite" \
  "SELECT receipt_id, decision, reason_code FROM operations_rollback_receipts ORDER BY receipt_id;" \
  > "$EVIDENCE_DIR/rollback-receipts.json"
printf 'rollback_receipts=2\n'
