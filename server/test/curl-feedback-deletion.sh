#!/usr/bin/env bash
set -euo pipefail

readonly BASE_URL="${SOMEWHERE_BASE_URL:-http://127.0.0.1:8787}"
readonly ORIGIN="$BASE_URL"
TMP_DIR="$(mktemp -d -t somewhere-feedback-curl.XXXXXXXX)"
readonly TMP_DIR
trap 'find "$TMP_DIR" -depth -mindepth 1 -delete; rmdir "$TMP_DIR"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

request() {
  local label="$1"
  shift
  curl --silent --show-error \
    --dump-header "$TMP_DIR/$label.headers" \
    --output "$TMP_DIR/$label.body" \
    --write-out '%{http_code}' \
    "$@"
}

json_field() {
  bun -e '
    const value = await Bun.file(process.argv[1]).json();
    let current = value;
    for (const key of process.argv[2].split(".")) current = current[key];
    process.stdout.write(typeof current === "object" ? JSON.stringify(current) : String(current));
  ' "$1" "$2"
}

key() {
  local character="$1"
  printf 'ik_v1.%s' "$(printf '%43s' '' | tr ' ' "$character")"
}

readonly CREATE_BODY='{"contractVersion":1,"constraints":{"category":"restaurant","maxWalkMinutes":30,"budgetBand":"medium","dietary":[],"accessibility":[]},"origin":{"latitude":37.54385,"longitude":127.03695,"accuracyM":5,"capturedAt":1785283200000},"disclosureLevel":"standard","recoveryCapability":null}'
readonly VERSION_BODY='{"contractVersion":1}'
readonly ARRIVAL_BODY='{"contractVersion":1,"endpointDistanceBand":"within-arrival-threshold","accuracyBand":"good","consecutiveSamples":4,"dwellMs":12000,"routeConsistency":"consistent"}'

session_status="$(request session -c "$TMP_DIR/cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' "$BASE_URL/api/v1/session")"
[[ "$session_status" == 200 ]] || fail "session status $session_status"
csrf="$(json_field "$TMP_DIR/session.body" csrfToken)"

create_status="$(request create \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key A)" \
  --data "$CREATE_BODY" \
  "$BASE_URL/api/v1/journeys")"
[[ "$create_status" == 201 ]] || fail "create status $create_status"
journey_id="$(json_field "$TMP_DIR/create.body" journeyId)"

commit_status="$(request commit \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key B)" \
  -H 'X-Expected-Sequence: 1' \
  --data "$VERSION_BODY" \
  "$BASE_URL/api/v1/journeys/$journey_id/commit")"
[[ "$commit_status" == 200 ]] || fail "commit status $commit_status"

arrival_status="$(request arrival \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key C)" \
  -H 'X-Expected-Sequence: 2' \
  --data "$ARRIVAL_BODY" \
  "$BASE_URL/api/v1/journeys/$journey_id/arrival")"
[[ "$arrival_status" == 200 ]] || fail "arrival status $arrival_status"
[[ "$(json_field "$TMP_DIR/arrival.body" result.phase)" == arrived ]] || fail "arrival phase"
feedback_capability="$(json_field "$TMP_DIR/arrival.body" feedbackCapability)"

arrival_replay_status="$(request arrival-replay \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key C)" \
  -H 'X-Expected-Sequence: 2' \
  --data "$ARRIVAL_BODY" \
  "$BASE_URL/api/v1/journeys/$journey_id/arrival")"
[[ "$arrival_replay_status" == 200 ]] || fail "arrival replay status $arrival_replay_status"
cmp -s "$TMP_DIR/arrival.body" "$TMP_DIR/arrival-replay.body" || fail "arrival replay bytes"
rg -qi '^idempotent-replayed: true' "$TMP_DIR/arrival-replay.headers" || fail "arrival replay header"

get_status="$(request get -b "$TMP_DIR/cookies" "$BASE_URL/api/v1/journeys/$journey_id")"
[[ "$get_status" == 200 ]] || fail "journey GET status $get_status"
if rg -q 'feedbackCapability|fc_v1\\.' "$TMP_DIR/get.body"; then
  fail "journey GET leaked raw feedback capability"
fi

early_status="$(request feedback-early \
  -H "Authorization: Feedback $feedback_capability" \
  "$BASE_URL/api/v1/feedback/eligible")"
[[ "$early_status" == 204 && ! -s "$TMP_DIR/feedback-early.body" ]] || fail "early feedback status/body"

delete_status="$(request delete \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key D)" \
  -H 'X-Expected-Sequence: 3' \
  -X DELETE \
  "$BASE_URL/api/v1/journeys/$journey_id")"
[[ "$delete_status" == 204 && ! -s "$TMP_DIR/delete.body" ]] || fail "delete status/body"

delete_replay_status="$(request delete-replay \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key D)" \
  -H 'X-Expected-Sequence: 3' \
  -X DELETE \
  "$BASE_URL/api/v1/journeys/$journey_id")"
[[ "$delete_replay_status" == 204 ]] || fail "delete replay status $delete_replay_status"

deleted_feedback_status="$(request feedback-deleted \
  -H "Authorization: Feedback $feedback_capability" \
  "$BASE_URL/api/v1/feedback/eligible")"
[[ "$deleted_feedback_status" == 404 ]] || fail "deleted feedback status $deleted_feedback_status"

printf 'PASS arrival raw-only exact replay and pre-due 204\n'
printf 'PASS delete completion replay and feedback revocation\n'
