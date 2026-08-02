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

PREPARED_INPUT_COUNT=0
for value in \
  "${SOMEWHERE_PREPARED_BUILD_ROOT:-}" \
  "${SOMEWHERE_PREPARED_BUILD_RECEIPT:-}" \
  "${SOMEWHERE_PREPARED_SOURCE_ARCHIVE:-}"; do
  [[ -n "$value" ]] && PREPARED_INPUT_COUNT=$((PREPARED_INPUT_COUNT + 1))
done
[[ "$PREPARED_INPUT_COUNT" -eq 0 || "$PREPARED_INPUT_COUNT" -eq 3 ]]
EXACT_PREPARED_MODE=false
[[ "$PREPARED_INPUT_COUNT" -eq 3 ]] && EXACT_PREPARED_MODE=true

runtime_source_sha256() {
  local path="$1"
  if [[ "$EXACT_PREPARED_MODE" == true ]]; then
    tar -xOf "$SOMEWHERE_PREPARED_SOURCE_ARCHIVE" "$path" | sha256sum | awk '{ print "sha256:" $1 }'
  else
    sha256sum "$REPO_ROOT/$path" | awk '{ print "sha256:" $1 }'
  fi
}

bun scripts/operations/verify-legal.ts | tee "$EVIDENCE_DIR/legal-gates.json"
bun run test:server -- task14 | tee "$EVIDENCE_DIR/task14-tests.txt"
bun run --cwd server test -- \
  --config test/journey-runtime.vitest.config.ts \
  --reporter=json \
  --outputFile="$EVIDENCE_DIR/journey-do-runtime-report.json"
bun run --cwd server test -- \
  --config test/async-runtime.vitest.config.ts \
  --reporter=json \
  --outputFile="$EVIDENCE_DIR/async-do-runtime-report.json"
bun run --cwd server test -- \
  task14-feedback-epoch \
  --reporter=json \
  --outputFile="$EVIDENCE_DIR/write-fence-runtime-report.json"
jq -e '.success == true and .numFailedTests == 0 and .numPassedTests == 2' \
  "$EVIDENCE_DIR/journey-do-runtime-report.json" > /dev/null
jq -e '.success == true and .numFailedTests == 0 and .numPassedTests == 2' \
  "$EVIDENCE_DIR/async-do-runtime-report.json" > /dev/null
jq -e '.success == true and .numFailedTests == 0 and .numPassedTests == 4' \
  "$EVIDENCE_DIR/write-fence-runtime-report.json" > /dev/null
jq -n \
  --slurpfile journey "$EVIDENCE_DIR/journey-do-runtime-report.json" \
  --slurpfile alarm "$EVIDENCE_DIR/async-do-runtime-report.json" \
  --slurpfile fence "$EVIDENCE_DIR/write-fence-runtime-report.json" \
  --arg journeySource "$(runtime_source_sha256 server/test/journey-do-cloudflare.runtime.ts)" \
  --arg alarmSource "$(runtime_source_sha256 server/test/async-alarm-todo12.runtime.ts)" \
  --arg fenceSource "$(runtime_source_sha256 server/test/task14-feedback-epoch.test.ts)" \
  --arg journeyReport "sha256:$(sha256sum "$EVIDENCE_DIR/journey-do-runtime-report.json" | awk '{ print $1 }')" \
  --arg alarmReport "sha256:$(sha256sum "$EVIDENCE_DIR/async-do-runtime-report.json" | awk '{ print $1 }')" \
  --arg fenceReport "sha256:$(sha256sum "$EVIDENCE_DIR/write-fence-runtime-report.json" | awk '{ print $1 }')" \
  '{
    schemaVersion: 2,
    scope: "local-deterministic-workerd",
    suites: [
      {
        key: "alarmRestart",
        path: "server/test/async-alarm-todo12.runtime.ts",
        sourceSha256: $alarmSource,
        passed: $alarm[0].success,
        assertionCount: ([$alarm[0].testResults[].assertionResults[]] | length),
        rawReport: {path: "async-do-runtime-report.json", sha256: $alarmReport}
      },
      {
        key: "journeyState",
        path: "server/test/journey-do-cloudflare.runtime.ts",
        sourceSha256: $journeySource,
        passed: $journey[0].success,
        assertionCount: ([$journey[0].testResults[].assertionResults[]] | length),
        rawReport: {path: "journey-do-runtime-report.json", sha256: $journeyReport}
      },
      {
        key: "writeFence",
        path: "server/test/task14-feedback-epoch.test.ts",
        sourceSha256: $fenceSource,
        passed: $fence[0].success,
        assertionCount: ([$fence[0].testResults[].assertionResults[]] | length),
        rawReport: {path: "write-fence-runtime-report.json", sha256: $fenceReport}
      }
    ]
  }' > "$EVIDENCE_DIR/live-do-fence-runtime.json"
bun test \
  scripts/release/test/local-hidden-slice-startup.test.mjs \
  scripts/release/test/local-hidden-slice-stop.test.mjs \
  2>&1 | tee "$EVIDENCE_DIR/live-failure-cleanup-tests.txt"
{
  bun run --cwd server typecheck
  node_modules/.bin/wrangler types --check \
    --config=server/wrangler.jsonc \
    server/src/worker-configuration.d.ts
} | tee "$EVIDENCE_DIR/typecheck.txt"
if [[ "$EXACT_PREPARED_MODE" == true ]]; then
  bun scripts/release/write-prepared-build-reference.mjs \
    --sha "$SOMEWHERE_SOURCE_SHA" \
    --source-tree "$SOMEWHERE_SOURCE_TREE" \
    --build-root "$SOMEWHERE_PREPARED_BUILD_ROOT" \
    --build-receipt "$SOMEWHERE_PREPARED_BUILD_RECEIPT" \
    --source-archive "$SOMEWHERE_PREPARED_SOURCE_ARCHIVE" \
    --output "$EVIDENCE_DIR/production-build.json"
  printf 'reused exact prepared production build: %s\n' \
    "$SOMEWHERE_PREPARED_BUILD_RECEIPT" | tee "$EVIDENCE_DIR/app-build.txt"
  PRODUCTION_ASSET_DIR="$SOMEWHERE_PREPARED_BUILD_ROOT/app/dist"
else
  bun run build:production -- \
    --outdir "$TASK_ROOT/production" \
    --receipt "$EVIDENCE_DIR/production-build.json" \
    --artifact-role local-diagnostic \
    | tee "$EVIDENCE_DIR/app-build.txt"
  PRODUCTION_ASSET_DIR="$TASK_ROOT/production/app/dist"
fi
node_modules/.bin/wrangler deploy --dry-run --env=production --config server/wrangler.jsonc \
  --assets "$PRODUCTION_ASSET_DIR" \
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

D1_DB="$(find "$LIVE_RUN_DIR/state/v3/d1" -type f -name '*.sqlite' ! -name 'metadata.sqlite' | head -n 1)"
[[ -n "$D1_DB" ]]
SCHEDULED_MESSAGE="$TASK_ROOT/scheduled-message.json"
bun -e '
  const { buildAsyncMessage } = await import("./server/src/async/message.ts");
  const occurredAt = Date.now();
  const message = await buildAsyncMessage({
    eventType: "journey.activation.repair",
    occurredAt,
    subjectDigest: "1".repeat(64),
    writeEpoch: 1,
  });
  console.log(JSON.stringify(message));
' > "$SCHEDULED_MESSAGE"
SCHEDULED_EVENT_ID="$(jq -r '.eventId' "$SCHEDULED_MESSAGE")"
SCHEDULED_EVENT_DIGEST="$(jq -r '.eventDigest' "$SCHEDULED_MESSAGE")"
SCHEDULED_OCCURRED_AT="$(jq -r '.occurredAt' "$SCHEDULED_MESSAGE")"
SCHEDULED_EXPIRES_AT="$((SCHEDULED_OCCURRED_AT + 172800000))"
sqlite3 "$D1_DB" \
  "INSERT INTO outbox_events (event_id, aggregate_digest, event_digest, event_type, delivery_state, write_epoch, created_at, acknowledged_at, expires_at) VALUES ('$SCHEDULED_EVENT_ID', '$(printf '1%.0s' {1..64})', '$SCHEDULED_EVENT_DIGEST', 'journey.activation.repair', 'pending', 1, $SCHEDULED_OCCURRED_AT, NULL, $SCHEDULED_EXPIRES_AT);"
sqlite3 -json "$D1_DB" \
  "SELECT event_id, event_digest, delivery_state, acknowledged_at FROM outbox_events WHERE event_id = '$SCHEDULED_EVENT_ID';" \
  > "$TASK_ROOT/scheduled-before.json"
curl --silent --show-error --include \
  "$OPS_BASE_URL/cdn-cgi/handler/scheduled" \
  > "$EVIDENCE_DIR/live-scheduled-http.txt"
SCHEDULED_HTTP_STATUS="$(
  awk 'NR == 1 { print $2 }' "$EVIDENCE_DIR/live-scheduled-http.txt" | tr -d '\r'
)"
SCHEDULED_RESPONSE_BODY="$(tail -n 1 "$EVIDENCE_DIR/live-scheduled-http.txt" | tr -d '\r')"
[[ "$SCHEDULED_HTTP_STATUS" == 200 && "$SCHEDULED_RESPONSE_BODY" == ok ]]
for _ in $(seq 1 100); do
  SCHEDULED_DELIVERED="$(
    sqlite3 "$D1_DB" \
      "SELECT COUNT(*) FROM outbox_events WHERE event_id = '$SCHEDULED_EVENT_ID' AND delivery_state = 'delivered' AND acknowledged_at IS NOT NULL;"
  )"
  [[ "$SCHEDULED_DELIVERED" -eq 1 ]] && break
  sleep 0.2
done
[[ "$SCHEDULED_DELIVERED" -eq 1 ]]
sqlite3 -json "$D1_DB" \
  "SELECT event_id, event_digest, delivery_state, acknowledged_at FROM outbox_events WHERE event_id = '$SCHEDULED_EVENT_ID';" \
  > "$TASK_ROOT/scheduled-after-outbox.json"
sqlite3 -json "$D1_DB" \
  "SELECT event_id, event_digest, event_type, result_code, write_epoch FROM inbox_events WHERE event_id = '$SCHEDULED_EVENT_ID';" \
  > "$TASK_ROOT/scheduled-after-inbox.json"
jq -n \
  --slurpfile message "$SCHEDULED_MESSAGE" \
  --slurpfile before "$TASK_ROOT/scheduled-before.json" \
  --slurpfile afterOutbox "$TASK_ROOT/scheduled-after-outbox.json" \
  --slurpfile afterInbox "$TASK_ROOT/scheduled-after-inbox.json" \
  --argjson httpStatus "$SCHEDULED_HTTP_STATUS" \
  --arg responseBody "$SCHEDULED_RESPONSE_BODY" \
  '{
    schemaVersion: 1,
    scope: "local-deterministic-miniflare",
    trigger: { httpStatus: $httpStatus, responseBody: $responseBody },
    message: $message[0],
    before: { outbox: $before[0][0] },
    after: {
      outbox: $afterOutbox[0][0],
      inbox: $afterInbox[0][0]
    }
  }' > "$EVIDENCE_DIR/live-scheduled-state.json"
curl --silent --show-error \
  "$OPS_BASE_URL/cdn-cgi/explorer/api/workers/durable_objects/namespaces" \
  > "$EVIDENCE_DIR/live-do-namespaces.json"
find "$LIVE_RUN_DIR/state" -type f -printf '%p %s\n' \
  | sort > "$EVIDENCE_DIR/live-runtime-state-files.txt"
cp "$LIVE_RUN_DIR/worker.log" "$EVIDENCE_DIR/live-worker-log.txt"

sqlite3 -json "$D1_DB" \
  "SELECT terminal_type, write_epoch, replay_status FROM journey_tombstones ORDER BY coarse_utc_bucket;" \
  > "$EVIDENCE_DIR/live-d1.json"
bash scripts/operations/capture-local-queue-evidence.sh \
  "$D1_DB" "$LIVE_RUN_DIR" "$EVIDENCE_DIR" "$TASK_ROOT"

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
