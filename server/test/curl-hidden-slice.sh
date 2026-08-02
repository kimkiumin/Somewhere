#!/usr/bin/env bash
set -euo pipefail

readonly BASE_URL="${SOMEWHERE_BASE_URL:-http://127.0.0.1:8787}"
readonly ORIGIN="$BASE_URL"
readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d -t somewhere-hidden-curl.XXXXXXXX)"
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

session() {
  local label="$1"
  local jar="$2"
  local status
  status="$(request "$label" -c "$jar" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' "$BASE_URL/api/v1/session")"
  [[ "$status" == 200 ]] || fail "$label session status $status"
  rg -qi '^set-cookie: __Host-somewhere_session=[A-Za-z0-9_-]{43}; Secure; HttpOnly; SameSite=Strict; Path=/' "$TMP_DIR/$label.headers" \
    || fail "$label protected cookie"
  rg -qi '^cache-control: no-store, private' "$TMP_DIR/$label.headers" || fail "$label no-store"
}

json_field() {
  bun -e '
    const value = await Bun.file(process.argv[1]).json();
    const keys = process.argv[2].split(".");
    let current = value;
    for (const key of keys) current = current[key];
    if (typeof current === "object") process.stdout.write(JSON.stringify(current));
    else process.stdout.write(String(current));
  ' "$1" "$2"
}

readonly KEY_CREATE='ik_v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
readonly KEY_COMMIT='ik_v1.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
readonly KEY_REVEAL='ik_v1.CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'
readonly KEY_DELETE='ik_v1.DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'
readonly KEY_OTHER='ik_v1.EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'
readonly KEY_OFFZONE='ik_v1.FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
readonly KEY_NOFIT='ik_v1.GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG'
readonly CREATE_BODY='{"contractVersion":1,"constraints":{"category":"restaurant","maxWalkMinutes":30,"budgetBand":"medium","dietary":[],"accessibility":[]},"origin":{"latitude":37.54385,"longitude":127.03695,"accuracyM":5,"capturedAt":1785283200000},"disclosureLevel":"standard","recoveryCapability":null}'
readonly VERSION_BODY='{"contractVersion":1}'

health_status="$(request health "$BASE_URL/api/v1/health")"
[[ "$health_status" == 200 ]] || fail "health status $health_status"
rg -qi '^cache-control: no-store, private' "$TMP_DIR/health.headers" || fail "health no-store"

session primary "$TMP_DIR/primary.cookies"
csrf="$(json_field "$TMP_DIR/primary.body" csrfToken)"
[[ "$(json_field "$TMP_DIR/primary.body" contractVersion)" == 1 ]] || fail "session version"
[[ "$(json_field "$TMP_DIR/primary.body" csrfExpiresAt)" =~ ^[0-9]+$ ]] || fail "csrf expiry"
[[ "$(json_field "$TMP_DIR/primary.body" sessionExpiresAt)" =~ ^[0-9]+$ ]] || fail "session expiry"

create_status="$(request create -b "$TMP_DIR/primary.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' -H "X-CSRF-Token: $csrf" -H "Idempotency-Key: $KEY_CREATE" --data "$CREATE_BODY" "$BASE_URL/api/v1/journeys")"
[[ "$create_status" == 201 ]] || fail "create status $create_status body=$(cat "$TMP_DIR/create.body")"
journey_id="$(json_field "$TMP_DIR/create.body" journeyId)"
sequence="$(json_field "$TMP_DIR/create.body" sequence)"
[[ "$(json_field "$TMP_DIR/create.body" phase)" == ready && "$sequence" == 1 ]] || fail "ready projection"
if rg -qi '소문난성수감자탕|연무장길|encodedPolyline|receipt|pool|provider|endpoint|127\\.05467' "$TMP_DIR/create.body"; then
  fail "pre-Commit response leaked hidden canary"
fi

replay_status="$(request create-replay -b "$TMP_DIR/primary.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' -H "X-CSRF-Token: $csrf" -H "Idempotency-Key: $KEY_CREATE" --data "$CREATE_BODY" "$BASE_URL/api/v1/journeys")"
[[ "$replay_status" == 201 ]] || fail "create replay status $replay_status"
cmp -s "$TMP_DIR/create.body" "$TMP_DIR/create-replay.body" || fail "create replay not byte-equivalent"

changed_body="${CREATE_BODY/\"maxWalkMinutes\":30/\"maxWalkMinutes\":29}"
changed_status="$(request changed-replay -b "$TMP_DIR/primary.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' -H "X-CSRF-Token: $csrf" -H "Idempotency-Key: $KEY_CREATE" --data "$changed_body" "$BASE_URL/api/v1/journeys")"
[[ "$changed_status" == 409 ]] || fail "changed-body replay status $changed_status"

get_status="$(request get -b "$TMP_DIR/primary.cookies" "$BASE_URL/api/v1/journeys/$journey_id")"
[[ "$get_status" == 200 && "$(json_field "$TMP_DIR/get.body" phase)" == ready ]] || fail "GET ready"

wrong_csrf_status="$(request wrong-csrf -b "$TMP_DIR/primary.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' -H 'X-CSRF-Token: csrf_v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' -H "Idempotency-Key: $KEY_COMMIT" -H 'X-Expected-Sequence: 1' --data "$VERSION_BODY" "$BASE_URL/api/v1/journeys/$journey_id/commit")"
[[ "$wrong_csrf_status" == 403 ]] || fail "wrong CSRF status $wrong_csrf_status"

session foreign "$TMP_DIR/foreign.cookies"
foreign_status="$(request foreign-get -b "$TMP_DIR/foreign.cookies" "$BASE_URL/api/v1/journeys/$journey_id")"
[[ "$foreign_status" == 404 ]] || fail "foreign GET status $foreign_status"

commit_status="$(request commit -b "$TMP_DIR/primary.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' -H "X-CSRF-Token: $csrf" -H "Idempotency-Key: $KEY_COMMIT" -H 'X-Expected-Sequence: 1' --data "$VERSION_BODY" "$BASE_URL/api/v1/journeys/$journey_id/commit")"
[[ "$commit_status" == 200 ]] || fail "commit status $commit_status body=$(cat "$TMP_DIR/commit.body")"
[[ "$(json_field "$TMP_DIR/commit.body" phase)" == following && "$(json_field "$TMP_DIR/commit.body" sequence)" == 2 ]] || fail "following projection"
[[ "$(json_field "$TMP_DIR/commit.body" guidance.kind)" == route ]] || fail "route not released after Commit"
if rg -qi '소문난성수감자탕|연무장길|provider|receipt|pool' "$TMP_DIR/commit.body"; then
  fail "post-Commit pre-Reveal response leaked identity"
fi

commit_replay_status="$(request commit-replay -b "$TMP_DIR/primary.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' -H "X-CSRF-Token: $csrf" -H "Idempotency-Key: $KEY_COMMIT" -H 'X-Expected-Sequence: 1' --data "$VERSION_BODY" "$BASE_URL/api/v1/journeys/$journey_id/commit")"
[[ "$commit_replay_status" == 200 ]] || fail "commit replay status"
cmp -s "$TMP_DIR/commit.body" "$TMP_DIR/commit-replay.body" || fail "commit replay not byte-equivalent"

reveal_status="$(request reveal -b "$TMP_DIR/primary.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' -H "X-CSRF-Token: $csrf" -H "Idempotency-Key: $KEY_REVEAL" -H 'X-Expected-Sequence: 2' --data "$VERSION_BODY" "$BASE_URL/api/v1/journeys/$journey_id/reveal")"
[[ "$reveal_status" == 200 ]] || fail "reveal status $reveal_status body=$(cat "$TMP_DIR/reveal.body")"
[[ "$(json_field "$TMP_DIR/reveal.body" phase)" == following && "$(json_field "$TMP_DIR/reveal.body" revealed)" == true && "$(json_field "$TMP_DIR/reveal.body" sequence)" == 3 ]] || fail "Reveal changed phase"
rg -q '소문난성수감자탕' "$TMP_DIR/reveal.body" || fail "Reveal omitted identity"

delete_status="$(request delete -b "$TMP_DIR/primary.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' -H "X-CSRF-Token: $csrf" -H "Idempotency-Key: $KEY_DELETE" -H 'X-Expected-Sequence: 3' -X DELETE "$BASE_URL/api/v1/journeys/$journey_id")"
[[ "$delete_status" == 204 && ! -s "$TMP_DIR/delete.body" ]] || fail "DELETE status/body"
delete_replay_status="$(request delete-replay -b "$TMP_DIR/primary.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' -H "X-CSRF-Token: $csrf" -H "Idempotency-Key: $KEY_DELETE" -H 'X-Expected-Sequence: 3' -X DELETE "$BASE_URL/api/v1/journeys/$journey_id")"
[[ "$delete_replay_status" == 204 ]] || fail "DELETE replay"
delete_other_status="$(request delete-other -b "$TMP_DIR/primary.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' -H "X-CSRF-Token: $csrf" -H "Idempotency-Key: $KEY_OTHER" -H 'X-Expected-Sequence: 3' -X DELETE "$BASE_URL/api/v1/journeys/$journey_id")"
[[ "$delete_other_status" == 410 ]] || fail "new DELETE key after tombstone"

null_origin_status="$(request null-origin -H 'Origin:' -H 'Sec-Fetch-Site: same-origin' "$BASE_URL/api/v1/session")"
[[ "$null_origin_status" == 403 ]] || fail "null Origin status $null_origin_status"
foreign_origin_status="$(request foreign-origin -H 'Origin: https://attacker.invalid' -H 'Sec-Fetch-Site: cross-site' "$BASE_URL/api/v1/session")"
[[ "$foreign_origin_status" == 403 ]] || fail "foreign Origin status $foreign_origin_status"
wrong_host_status="$(request wrong-host -H 'Host: attacker.invalid' -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' "$BASE_URL/api/v1/session")"
[[ "$wrong_host_status" == 403 ]] || fail "wrong Host status $wrong_host_status"

session offzone "$TMP_DIR/offzone.cookies"
offzone_csrf="$(json_field "$TMP_DIR/offzone.body" csrfToken)"
offzone_body="${CREATE_BODY/37.54385/37.50000}"
offzone_status="$(request offzone-create -b "$TMP_DIR/offzone.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' -H "X-CSRF-Token: $offzone_csrf" -H "Idempotency-Key: $KEY_OFFZONE" --data "$offzone_body" "$BASE_URL/api/v1/journeys")"
[[ "$offzone_status" == 503 && "$(json_field "$TMP_DIR/offzone-create.body" error.code)" == route_unavailable ]] || fail "off-zone route status $offzone_status"

session nofit "$TMP_DIR/nofit.cookies"
nofit_csrf="$(json_field "$TMP_DIR/nofit.body" csrfToken)"
nofit_body="${CREATE_BODY/\"maxWalkMinutes\":30/\"maxWalkMinutes\":1}"
nofit_status="$(request nofit-create -b "$TMP_DIR/nofit.cookies" -H "Origin: $ORIGIN" -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' -H "X-CSRF-Token: $nofit_csrf" -H "Idempotency-Key: $KEY_NOFIT" --data "$nofit_body" "$BASE_URL/api/v1/journeys")"
[[ "$nofit_status" == 422 && "$(json_field "$TMP_DIR/nofit-create.body" error.code)" == no_fit ]] || fail "no-fit status $nofit_status"

if rg -q '소문난성수감자탕|연무장길 45|manual:seongsu-gamjatang' "$ROOT_DIR/app/dist" 2>/dev/null; then
  fail "static app bundle contains hidden identity canary"
fi
bun run --cwd "$ROOT_DIR/server" test -- provider route >/dev/null

printf 'PASS session→create→GET→commit→reveal→DELETE\n'
printf 'PASS byte-equivalent create/commit/delete replay\n'
printf 'NEGATIVE_PASS csrf origin foreign-session changed-body tombstone\n'
printf 'NEGATIVE_PASS no-fit off-zone-route provider-rights-policy\n'
printf 'NEGATIVE_PASS identity-canary pre-Commit and static-bundle concealment\n'
