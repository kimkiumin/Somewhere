#!/usr/bin/env bash
set -euo pipefail

D1_DB="${1:?D1 database required}"
LIVE_RUN_DIR="${2:?live run directory required}"
EVIDENCE_DIR="${3:?evidence directory required}"
TASK_ROOT="${4:?task directory required}"

QUEUE_RECEIPT_COUNT=0
for _ in $(seq 1 100); do
  QUEUE_RECEIPT_COUNT="$(sqlite3 "$D1_DB" "SELECT COUNT(*) FROM inbox_events;")"
  [[ "$QUEUE_RECEIPT_COUNT" -gt 0 ]] && break
  sleep 0.2
done
[[ "$QUEUE_RECEIPT_COUNT" -gt 0 ]]
sqlite3 -json "$D1_DB" \
  "SELECT event_id, event_digest, event_type, result_code, write_epoch FROM inbox_events ORDER BY received_at;" \
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
  "SELECT audit_event_id, action_code, substr(audit_event_id, 10) AS poison_digest, result_code, occurred_at FROM audit_events WHERE action_code = 'dlq-delivery';" \
  > "$EVIDENCE_DIR/live-dlq.txt"

bun -e '
  const { buildInvalidPoisonMessage } = await import("./server/src/async/message.ts");
  const body = { probe: "task14-invalid-queue", schemaVersion: 0 };
  console.log(JSON.stringify({
    body,
    poison: await buildInvalidPoisonMessage(body, 1),
  }));
' > "$TASK_ROOT/invalid-poison.json"
POISON_DIGEST="$(jq -r '.poison.originalEventDigest' "$TASK_ROOT/invalid-poison.json")"
rg '"event":"local-queue-attempt"' "$LIVE_RUN_DIR/worker.log" \
  > "$EVIDENCE_DIR/live-queue-attempts.txt"
jq -s \
  --arg digest "$POISON_DIGEST" \
  '[.[] | select(.originalEventDigest == $digest) | { attempt, originalEventDigest }]' \
  < "$EVIDENCE_DIR/live-queue-attempts.txt" \
  > "$TASK_ROOT/poison-attempts.json"
QUEUE_ATTEMPT_COUNT="$(jq 'length' "$TASK_ROOT/poison-attempts.json")"
[[ "$QUEUE_ATTEMPT_COUNT" -eq 5 ]]
rg 'QUEUE somewhere-events-dlq-local 1/1' "$LIVE_RUN_DIR/worker.log" \
  > "$EVIDENCE_DIR/live-dlq-delivery.txt"
rg 'QUEUE somewhere-events-local' "$LIVE_RUN_DIR/worker.log" \
  | jq -Rn \
    '[inputs | capture("QUEUE somewhere-events-local (?<acked>[0-9]+)/(?<total>[0-9]+)") | {
      acked: (.acked | tonumber),
      total: (.total | tonumber)
    }]' \
  > "$TASK_ROOT/queue-deliveries.json"

jq -n \
  --slurpfile poison "$TASK_ROOT/invalid-poison.json" \
  --slurpfile deliveries "$TASK_ROOT/queue-deliveries.json" \
  --slurpfile attempts "$TASK_ROOT/poison-attempts.json" \
  --slurpfile inbox "$EVIDENCE_DIR/live-queue.txt" \
  --slurpfile audit "$EVIDENCE_DIR/live-dlq.txt" \
  '{
    schemaVersion: 1,
    scope: "local-deterministic-miniflare",
    producer: {
      trigger: "scheduled-handler",
      validFixtureEventIds: ($inbox[0] | map(.event_id)),
      invalidFixture: $poison[0]
    },
    queueDeliveries: $deliveries[0],
    poisonAttempts: $attempts[0],
    dlq: {
      deliveryCount: ($audit[0] | length),
      auditReceipts: $audit[0]
    },
    configuredMaxRetries: 4
  }' > "$EVIDENCE_DIR/live-queue-chain.json"
