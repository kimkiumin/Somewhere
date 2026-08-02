run_remote_sql_check() {
  local kind="$1"
  local environment="$2"
  local database_name="${D1_DATABASE_NAME:-}"
  [[ "$environment" == "staging" ]] \
    || fail "$kind is restricted to the protected staging environment"
  [[ -n "$database_name" ]] || fail "set D1_DATABASE_NAME to the exact remote database name"
  local sql_file="$ROOT_DIR/scripts/release/sql/$kind.sql"
  need_file "$sql_file"
  GATE_TMP="$(mktemp -d -t somewhere-cloudflare-gate.XXXXXXXX)"
  wrangler d1 execute "$database_name" \
    --remote \
    --config "$CONFIG_FILE" \
    --env "$environment" \
    --file "$sql_file" \
    --json > "$GATE_TMP/$kind.json"
  if [[ -n "${GATE_RECEIPT:-}" ]]; then
    cp "$GATE_TMP/$kind.json" "$GATE_RECEIPT"
  fi
  bun "$ROOT_DIR/scripts/release/validate-d1-gate-result.mjs" \
    --input "$GATE_TMP/$kind.json" \
    || fail "$kind did not return one exact PASS result"
  pass "$environment $kind"
}

run_resume_check() {
  local base_url="${BASE_URL:-}"
  local timeout_seconds="${RESUME_TIMEOUT_SECONDS:-900}"
  [[ "$base_url" == https://* ]] || fail "set BASE_URL to the approved HTTPS staging origin"
  [[ "$timeout_seconds" =~ ^[0-9]+$ ]] \
    || fail "RESUME_TIMEOUT_SECONDS must be an integer"
  [[ "$timeout_seconds" -ge 300 && "$timeout_seconds" -le 1200 ]] \
    || fail "RESUME_TIMEOUT_SECONDS must be between 300 and 1200"
  GATE_TMP="$(mktemp -d -t somewhere-cloudflare-gate.XXXXXXXX)"
  local attempts=$((timeout_seconds / 5))
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    curl --silent --show-error "$base_url/api/v1/operations/health" \
      > "$GATE_TMP/resume.json"
    if HEALTH_FILE="$GATE_TMP/resume.json" bun --eval '
      import { readFileSync } from "node:fs";
      const health = JSON.parse(readFileSync(process.env.HEALTH_FILE, "utf8"));
      if (health.status !== "ready" || health.externalGates !== "PASS" ||
          health.writeFenceMode !== "OPEN") process.exit(1);
    '; then
      pass "authority-controlled recovery is open"
      return
    fi
    sleep 5
  done
  fail "authority recovery did not reopen within ${timeout_seconds}s"
}

run_remote_read() {
  local environment="$1"
  local database_name="${D1_DATABASE_NAME:-}"
  [[ "$environment" == "staging" || "$environment" == "production" ]] \
    || fail "remote-read environment must be staging or production"
  [[ -n "$database_name" ]] \
    || fail "set D1_DATABASE_NAME to the exact remote database name"

  run_selftest
  need_file "$CONFIG_FILE"
  wrangler whoami
  wrangler d1 info "$database_name" \
    --config "$CONFIG_FILE" \
    --env "$environment"
  wrangler d1 migrations list "$database_name" \
    --config "$CONFIG_FILE" \
    --env "$environment" \
    --remote
  wrangler d1 time-travel info "$database_name" \
    --config "$CONFIG_FILE" \
    --env "$environment"
  wrangler versions list \
    --config "$CONFIG_FILE" \
    --env "$environment"

  pass "$environment remote identity, D1, migrations, restore point, and versions"
}

run_postdeploy() {
  local base_url="${BASE_URL:-}"
  [[ "$base_url" == https://* ]] \
    || fail "set BASE_URL to the approved HTTPS staging or production origin"

  need_command curl
  GATE_TMP="$(mktemp -d -t somewhere-cloudflare-gate.XXXXXXXX)"

  local shell_status
  local health_status
  local unknown_status

  shell_status="$(curl --silent --show-error \
    --output "$GATE_TMP/shell.body" \
    --dump-header "$GATE_TMP/shell.headers" \
    --write-out '%{http_code}' \
    "$base_url/")"
  [[ "$shell_status" == "200" ]] || fail "GET / returned $shell_status"
  rg -q -i '^content-type:[[:space:]]*text/html' "$GATE_TMP/shell.headers" \
    || fail "GET / is not HTML"

  health_status="$(curl --silent --show-error \
    --output "$GATE_TMP/health.body" \
    --dump-header "$GATE_TMP/health.headers" \
    --write-out '%{http_code}' \
    "$base_url/api/v1/health")"
  [[ "$health_status" == "200" ]] \
    || fail "GET /api/v1/health returned $health_status"
  rg -q -i '^content-type:[[:space:]]*application/json' "$GATE_TMP/health.headers" \
    || fail "health response is not JSON"
  rg -q -i '^cache-control:.*no-store' "$GATE_TMP/health.headers" \
    || fail "health response lacks Cache-Control: no-store"
  rg -q -i '^cache-control:.*private' "$GATE_TMP/health.headers" \
    || fail "health response lacks Cache-Control: private"

  unknown_status="$(curl --silent --show-error \
    --output "$GATE_TMP/unknown.body" \
    --dump-header "$GATE_TMP/unknown.headers" \
    --write-out '%{http_code}' \
    "$base_url/api/v1/__acceptance_missing__")"
  [[ "$unknown_status" == "404" ]] \
    || fail "unknown API route returned $unknown_status instead of 404"
  rg -q -i '^content-type:[[:space:]]*application/json' "$GATE_TMP/unknown.headers" \
    || fail "unknown API route fell through to the SPA instead of JSON"
  if rg -q -i '<!doctype html|<html' "$GATE_TMP/unknown.body"; then
    fail "unknown API route returned the SPA shell"
  fi

  pass "same-origin static/API routing and API no-store headers"
}
