#!/usr/bin/env bash
set -euo pipefail

TASK_ROOT=""
LIVE_RUN_DIR=""
OWN_EVIDENCE_DIR=false
cleanup() {
  if [[ -n "$LIVE_RUN_DIR" && -d "$LIVE_RUN_DIR" ]]; then
    server/scripts/stop-local-hidden-slice.sh "$LIVE_RUN_DIR" \
      > "$EVIDENCE_DIR/live-cleanup-receipt.json"
  fi
  if [[ -n "$TASK_ROOT" && -d "$TASK_ROOT" ]]; then
    find "$TASK_ROOT" -depth -mindepth 1 -delete
    rmdir "$TASK_ROOT"
  fi
  if [[ "$OWN_EVIDENCE_DIR" == true && -d "$EVIDENCE_DIR" ]]; then
    find "$EVIDENCE_DIR" -depth -mindepth 1 -delete
    rmdir "$EVIDENCE_DIR"
  fi
}
trap cleanup EXIT

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -n "${SOMEWHERE_OPS_EVIDENCE_DIR:-}" ]]; then
  EVIDENCE_DIR="$SOMEWHERE_OPS_EVIDENCE_DIR"
elif [[ -n "${SOMEWHERE_EVIDENCE_ROOT:-}" ]]; then
  EVIDENCE_DIR="$SOMEWHERE_EVIDENCE_ROOT/verify-ops"
else
  EVIDENCE_DIR="$(mktemp -d -t somewhere-v2-ops-evidence.XXXXXXXX)"
  OWN_EVIDENCE_DIR=true
fi
OPS_PORT="${SOMEWHERE_OPS_PORT:-18787}"
OPS_BASE_URL="http://127.0.0.1:$OPS_PORT"
mkdir -p "$EVIDENCE_DIR"
TASK_ROOT="$(mktemp -d)"
cd "$REPO_ROOT"

bun scripts/operations/verify-legal.ts | tee "$EVIDENCE_DIR/legal-gates.json"
bun run test:server -- task14 | tee "$EVIDENCE_DIR/task14-tests.txt"
bun run --cwd server typecheck | tee "$EVIDENCE_DIR/typecheck.txt"
bun run build:production -- \
  --outdir "$TASK_ROOT/production" \
  --receipt "$EVIDENCE_DIR/production-build.json" \
  | tee "$EVIDENCE_DIR/app-build.txt"
node_modules/.bin/wrangler deploy --dry-run --env="" --config server/wrangler.jsonc \
  --assets "$TASK_ROOT/production/app/dist" \
  --outdir "$TASK_ROOT/dry-run" | tee "$EVIDENCE_DIR/wrangler-dry-run.txt"

SOMEWHERE_LOCAL_PORT="$OPS_PORT" \
  server/scripts/start-local-hidden-slice.sh | tee "$TASK_ROOT/live-start.txt"
LIVE_RUN_DIR="$(sed -n 's/^RUN_DIR=//p' "$TASK_ROOT/live-start.txt")"
[[ "$LIVE_RUN_DIR" == /tmp/somewhere-hidden-slice.* && -f "$LIVE_RUN_DIR/receipt.json" ]]
cp "$LIVE_RUN_DIR/receipt.json" "$EVIDENCE_DIR/live-start-receipt.json"

curl --silent --show-error --include \
  "$OPS_BASE_URL/api/v1/operations/schema?probe=SOMEWHERE_CANARY_SECRET" \
  > "$EVIDENCE_DIR/live-http-schema.txt"
SOMEWHERE_BASE_URL="$OPS_BASE_URL" \
  bash server/test/curl-hidden-slice.sh | tee "$EVIDENCE_DIR/live-hidden-lifecycle.txt"
curl --silent --show-error --include \
  "$OPS_BASE_URL/cdn-cgi/handler/scheduled" \
  > "$EVIDENCE_DIR/live-scheduled-http.txt"
curl --silent --show-error \
  "$OPS_BASE_URL/cdn-cgi/explorer/api/workers/durable_objects/namespaces" \
  > "$EVIDENCE_DIR/live-do-namespaces.json"
find "$LIVE_RUN_DIR/state" -type f -printf '%p %s\n' \
  | sort > "$EVIDENCE_DIR/live-runtime-state-files.txt"
cp "$LIVE_RUN_DIR/worker.log" "$EVIDENCE_DIR/live-worker-log.txt"

D1_DB="$(find "$LIVE_RUN_DIR/state/v3/d1" -type f -name '*.sqlite' ! -name 'metadata.sqlite' | head -n 1)"
[[ -n "$D1_DB" ]]
sqlite3 -json "$D1_DB" \
  "SELECT terminal_type, write_epoch, replay_status FROM journey_tombstones ORDER BY coarse_utc_bucket;" \
  > "$EVIDENCE_DIR/live-d1.json"
QUEUE_RECEIPT_COUNT=0
for _ in $(seq 1 100); do
  QUEUE_RECEIPT_COUNT="$(sqlite3 "$D1_DB" "SELECT COUNT(*) FROM inbox_events;")"
  [[ "$QUEUE_RECEIPT_COUNT" -gt 0 ]] && break
  sleep 0.2
done
[[ "$QUEUE_RECEIPT_COUNT" -gt 0 ]]
sqlite3 -json "$D1_DB" \
  "SELECT event_type, result_code, write_epoch FROM inbox_events ORDER BY received_at;" \
  > "$EVIDENCE_DIR/live-queue.txt"
DLQ_RECEIPT_COUNT=0
for _ in $(seq 1 150); do
  DLQ_RECEIPT_COUNT="$(
    sqlite3 "$D1_DB" \
      "SELECT COUNT(*) FROM audit_events WHERE action_code = 'dlq-delivery';"
  )"
  [[ "$DLQ_RECEIPT_COUNT" -gt 0 ]] && break
  sleep 0.2
done
[[ "$DLQ_RECEIPT_COUNT" -gt 0 ]]
sqlite3 -json "$D1_DB" \
  "SELECT action_code, result_code, occurred_at FROM audit_events WHERE action_code = 'dlq-delivery';" \
  > "$EVIDENCE_DIR/live-dlq.txt"
rg 'QUEUE somewhere-events-local' "$LIVE_RUN_DIR/worker.log" \
  > "$EVIDENCE_DIR/live-queue-attempts.txt"
QUEUE_ATTEMPT_COUNT="$(wc -l < "$EVIDENCE_DIR/live-queue-attempts.txt")"
[[ "$QUEUE_ATTEMPT_COUNT" -ge 5 ]]
rg 'QUEUE somewhere-events-dlq-local 1/1' "$LIVE_RUN_DIR/worker.log" \
  > "$EVIDENCE_DIR/live-dlq-delivery.txt"

DO_COUNT="$(find "$LIVE_RUN_DIR/state/v3/do" -type f -name '*.sqlite' ! -name 'metadata.sqlite' | wc -l)"
[[ "$DO_COUNT" -gt 0 ]]
printf '{"durableObjectSqliteFiles":%s}\n' "$DO_COUNT" > "$EVIDENCE_DIR/live-do.json"
rg '^\{.*"schemaVersion":1.*\}$' "$LIVE_RUN_DIR/worker.log" \
  > "$EVIDENCE_DIR/live-custom-log.json"
[[ -s "$EVIDENCE_DIR/live-custom-log.json" ]]

bun scripts/operations/canary-scan.ts \
  "build:$TASK_ROOT/dry-run/index.js" \
  "http:$EVIDENCE_DIR/live-http-schema.txt" \
  "log:$EVIDENCE_DIR/live-custom-log.json" \
  "d1:$EVIDENCE_DIR/live-d1.json" \
  "do:$EVIDENCE_DIR/live-do.json" \
  "queue:$EVIDENCE_DIR/live-queue.txt" \
  "dlq:$EVIDENCE_DIR/live-dlq.txt" \
  "test-artifact:$EVIDENCE_DIR/task14-tests.txt" \
  | tee "$EVIDENCE_DIR/canary-scan.json"

bash scripts/operations/export-restore.sh "$EVIDENCE_DIR"
bash scripts/operations/rollback-dry-run.sh "$EVIDENCE_DIR" \
  | tee "$EVIDENCE_DIR/rollback-dry-run.txt"
server/scripts/stop-local-hidden-slice.sh "$LIVE_RUN_DIR" \
  | tee "$EVIDENCE_DIR/live-cleanup-receipt.json"
LIVE_RUN_DIR=""
bun -e '
  const started = await Bun.file(process.argv[1]).json();
  const stopped = await Bun.file(process.argv[2]).json();
  if (
    started.schemaVersion !== 1 ||
    stopped.schemaVersion !== 1 ||
    stopped.gate !== "PASS" ||
    stopped.pid !== started.pid ||
    stopped.processStartTime !== started.processStartTime ||
    stopped.processGroupId !== started.processGroupId ||
    stopped.port !== started.port ||
    stopped.pidAbsent !== true ||
    stopped.processGroupAbsent !== true ||
    stopped.portClosed !== true ||
    stopped.stateRemoved !== process.argv[3]
  ) {
    throw new TypeError("live cleanup identity or process-group proof mismatch");
  }
' \
  "$EVIDENCE_DIR/live-start-receipt.json" \
  "$EVIDENCE_DIR/live-cleanup-receipt.json" \
  "$(sed -n 's/^RUN_DIR=//p' "$TASK_ROOT/live-start.txt")"
printf '%s\n' \
  "verify_ops=PASS" \
  "live_http=PASS" \
  "live_d1=PASS" \
  "live_do=PASS" \
  "live_queue_delivery=PASS" \
  "live_dlq_delivery=PASS" \
  > "$EVIDENCE_DIR/summary.txt"
