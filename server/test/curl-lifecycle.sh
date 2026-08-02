#!/usr/bin/env bash
set -euo pipefail

readonly BASE_URL="${SOMEWHERE_BASE_URL:-http://127.0.0.1:8787}"
readonly ORIGIN="$BASE_URL"
TMP_DIR="$(mktemp -d -t somewhere-lifecycle-curl.XXXXXXXX)"
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

mutate() {
  local label="$1"
  local path="$2"
  local sequence="$3"
  local key_character="$4"
  local body="$5"
  request "$label" \
    -b "$TMP_DIR/cookies" \
    -H "Origin: $ORIGIN" \
    -H 'Sec-Fetch-Site: same-origin' \
    -H 'Content-Type: application/json' \
    -H "X-CSRF-Token: $csrf" \
    -H "Idempotency-Key: $(key "$key_character")" \
    -H "X-Expected-Sequence: $sequence" \
    --data "$body" \
    "$BASE_URL/api/v1/journeys/$journey_id/$path"
}

readonly VERSION='{"contractVersion":1}'
readonly CONSTRAINTS='{"category":"restaurant","maxWalkMinutes":30,"budgetBand":"medium","dietary":[],"accessibility":[]}'
readonly ORIGIN_BODY='{"latitude":37.54385,"longitude":127.03695,"accuracyM":5,"capturedAt":1785283200000}'
readonly CREATE_PREFIX='{"contractVersion":1,"constraints":'
readonly CREATE_SUFFIX=',"origin":'"$ORIGIN_BODY"',"disclosureLevel":"standard","recoveryCapability":'

session_status="$(request session -c "$TMP_DIR/cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' "$BASE_URL/api/v1/session")"
[[ "$session_status" == 200 ]] || fail "session status $session_status"
csrf="$(json_field "$TMP_DIR/session.body" csrfToken)"

create_body="$CREATE_PREFIX$CONSTRAINTS$CREATE_SUFFIX"'null}'
create_status="$(request create \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key A)" \
  --data "$create_body" \
  "$BASE_URL/api/v1/journeys")"
[[ "$create_status" == 201 ]] || fail "create status $create_status"
journey_id="$(json_field "$TMP_DIR/create.body" journeyId)"
[[ "$(json_field "$TMP_DIR/create.body" phase)" == ready ]] || fail "ready phase"

[[ "$(mutate commit commit 1 B "$VERSION")" == 200 ]] || fail "commit"
[[ "$(json_field "$TMP_DIR/commit.body" phase)" == following ]] || fail "following phase"
[[ "$(mutate reveal reveal 2 C "$VERSION")" == 200 ]] || fail "reveal"
[[ "$(json_field "$TMP_DIR/reveal.body" revealed)" == true ]] || fail "reveal flag"

[[ "$(mutate stop-one stop/request 3 D "$VERSION")" == 200 ]] || fail "first Stop"
stop_one_id="$(json_field "$TMP_DIR/stop-one.body" stopConfirmationId)"
[[ "$(json_field "$TMP_DIR/stop-one.body" phase)" == paused ]] || fail "Stop did not pause"
if rg -q '"guidance"' "$TMP_DIR/stop-one.body"; then
  fail "paused response retained guidance"
fi

cancel_body='{"contractVersion":1,"stopConfirmationId":"'"$stop_one_id"'"}'
[[ "$(mutate continue stop/cancel 4 E "$cancel_body")" == 200 ]] || fail "Continue"
[[ "$(json_field "$TMP_DIR/continue.body" phase)" == following ]] || fail "Continue phase"

[[ "$(mutate stop-two stop/request 5 F "$VERSION")" == 200 ]] || fail "second Stop"
stop_two_id="$(json_field "$TMP_DIR/stop-two.body" stopConfirmationId)"
confirm_body='{"contractVersion":1,"stopConfirmationId":"'"$stop_two_id"'"}'
[[ "$(mutate confirm stop/confirm 6 G "$confirm_body")" == 200 ]] || fail "Confirm stop"
[[ "$(json_field "$TMP_DIR/confirm.body" phase)" == stopped ]] || fail "stopped phase"

stale_continue_status="$(mutate stale-continue stop/cancel 6 H "$confirm_body")"
[[ "$stale_continue_status" == 409 ]] || fail "confirmed Stop race status $stale_continue_status"

reason_body='{"contractVersion":1,"reason":"skip","reasonPolicyVersion":"stop-reasons-v1"}'
[[ "$(mutate reason stop/reason 7 I "$reason_body")" == 200 ]] || fail "reason Skip"
[[ "$(json_field "$TMP_DIR/reason.body" phase)" == completed ]] || fail "completed phase"

intent_body='{"contractVersion":1,"action":"new-recommendation"}'
[[ "$(mutate recovery recovery 8 J "$intent_body")" == 201 ]] || fail "recovery intent"
intent_keys="$(bun -e '
  const value = await Bun.file(process.argv[1]).json();
  process.stdout.write(Object.keys(value).sort().join(","));
' "$TMP_DIR/recovery.body")"
[[ "$intent_keys" == "contractVersion,expiresAt,recoveryIntentId,requiredReviewFields" ]] \
  || fail "recovery intent keys $intent_keys"
[[ "$(mutate recovery-replay recovery 8 J "$intent_body")" == 201 ]] || fail "recovery replay"
cmp -s "$TMP_DIR/recovery.body" "$TMP_DIR/recovery-replay.body" \
  || fail "recovery replay not byte-equivalent"
rg -qi '^idempotent-replayed: true' "$TMP_DIR/recovery-replay.headers" \
  || fail "recovery replay header"
intent_id="$(json_field "$TMP_DIR/recovery.body" recoveryIntentId)"
confirm_recovery_body='{"contractVersion":1,"recoveryIntentId":"'"$intent_id"'","reviewedFields":["all-constraints"],"constraints":'"$CONSTRAINTS"'}'
[[ "$(mutate recovery-confirm recovery/confirm 9 K "$confirm_recovery_body")" == 201 ]] || fail "recovery confirm"
capability="$(json_field "$TMP_DIR/recovery-confirm.body" recoveryCapability)"

bad_capability_body="$CREATE_PREFIX$CONSTRAINTS$CREATE_SUFFIX"'"rc_v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'
bad_capability_status="$(request bad-capability \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key L)" \
  --data "$bad_capability_body" \
  "$BASE_URL/api/v1/journeys")"
[[ "$bad_capability_status" == 404 ]] || fail "bad capability status $bad_capability_status"

recovery_create_body="$CREATE_PREFIX$CONSTRAINTS$CREATE_SUFFIX"'"'"$capability"'"}'
wrong_constraints="${CONSTRAINTS/\"maxWalkMinutes\":30/\"maxWalkMinutes\":29}"
wrong_constraints_body="$CREATE_PREFIX$wrong_constraints$CREATE_SUFFIX"'"'"$capability"'"}'
wrong_constraints_status="$(request wrong-constraints \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key U)" \
  --data "$wrong_constraints_body" \
  "$BASE_URL/api/v1/journeys")"
[[ "$wrong_constraints_status" == 404 ]] || fail "constraint-bound capability status $wrong_constraints_status"

foreign_session_status="$(request foreign-session -c "$TMP_DIR/foreign.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' "$BASE_URL/api/v1/session")"
[[ "$foreign_session_status" == 200 ]] || fail "foreign session"
foreign_csrf="$(json_field "$TMP_DIR/foreign-session.body" csrfToken)"
wrong_session_status="$(request wrong-session \
  -b "$TMP_DIR/foreign.cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $foreign_csrf" \
  -H "Idempotency-Key: $(key V)" \
  --data "$recovery_create_body" \
  "$BASE_URL/api/v1/journeys")"
[[ "$wrong_session_status" == 404 ]] || fail "session-bound capability status $wrong_session_status"

recovery_create_status="$(request recovery-create \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key M)" \
  --data "$recovery_create_body" \
  "$BASE_URL/api/v1/journeys")"
[[ "$recovery_create_status" == 201 ]] || fail "recovery create status $recovery_create_status"
journey_id="$(json_field "$TMP_DIR/recovery-create.body" journeyId)"

reuse_status="$(request reuse \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key N)" \
  --data "$recovery_create_body" \
  "$BASE_URL/api/v1/journeys")"
[[ "$reuse_status" == 409 || "$reuse_status" == 404 ]] || fail "capability reuse status $reuse_status"

[[ "$(mutate recovery-commit commit 1 O "$VERSION")" == 200 ]] || fail "recovery commit"
invalid_arrival='{"contractVersion":1,"endpointDistanceBand":"within-arrival-threshold","accuracyBand":"good","consecutiveSamples":101,"dwellMs":12000,"routeConsistency":"consistent"}'
[[ "$(mutate invalid-arrival arrival 2 P "$invalid_arrival")" == 422 ]] || fail "invalid arrival schema"

poor_arrival='{"contractVersion":1,"endpointDistanceBand":"within-arrival-threshold","accuracyBand":"poor","consecutiveSamples":4,"dwellMs":12000,"routeConsistency":"consistent"}'
[[ "$(mutate poor-arrival arrival 2 Q "$poor_arrival")" == 200 ]] || fail "poor arrival request"
[[ "$(json_field "$TMP_DIR/poor-arrival.body" phase)" == following ]] || fail "poor evidence arrived"

arrival='{"contractVersion":1,"endpointDistanceBand":"within-arrival-threshold","accuracyBand":"good","consecutiveSamples":4,"dwellMs":12000,"routeConsistency":"consistent"}'
[[ "$(mutate arrival arrival 3 R "$arrival")" == 200 ]] || fail "arrival"
[[ "$(json_field "$TMP_DIR/arrival.body" result.phase)" == arrived ]] || fail "arrival phase"
[[ "$(json_field "$TMP_DIR/arrival.body" result.actions)" == '["reveal"]' ]] || fail "arrived actions"

delete_status="$(request delete \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key S)" \
  -H 'X-Expected-Sequence: 4' \
  -X DELETE \
  "$BASE_URL/api/v1/journeys/$journey_id")"
[[ "$delete_status" == 204 ]] || fail "delete"
reused_after_delete_status="$(request reused-after-delete \
  -b "$TMP_DIR/cookies" \
  -H "Origin: $ORIGIN" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $csrf" \
  -H "Idempotency-Key: $(key W)" \
  --data "$recovery_create_body" \
  "$BASE_URL/api/v1/journeys")"
[[ "$reused_after_delete_status" == 404 ]] || fail "consumed capability status $reused_after_delete_status"
deleted_status="$(mutate deleted reveal 4 T "$VERSION")"
[[ "$deleted_status" == 410 || "$deleted_status" == 404 ]] || fail "deleted journey status $deleted_status"

printf 'PASS ready→commit→follow→reveal→stop→continue\n'
printf 'PASS confirm→reason→recovery→arrival→delete\n'
printf 'NEGATIVE_PASS 409 Stop race, 404 capability omission/session/constraint/reuse, 410 tombstone, 422 arrival schema\n'
printf 'NEGATIVE_PASS poor arrival evidence remained following\n'
