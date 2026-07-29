#!/usr/bin/env bash
set -euo pipefail

readonly WRANGLER_VERSION="4.115.0"
readonly DEFAULT_ROOT="/home/tjrgus/Somewhere"
readonly ROOT_DIR="${SOMEWHERE_ROOT:-$DEFAULT_ROOT}"
readonly SERVER_DIR="$ROOT_DIR/server"
readonly APP_DIR="$ROOT_DIR/app"
readonly CONTRACTS_DIR="$ROOT_DIR/contracts"
readonly CONFIG_FILE="$SERVER_DIR/wrangler.jsonc"
GATE_TMP=""

cleanup() {
  if [[ -n "$GATE_TMP" && "$GATE_TMP" == /tmp/somewhere-cloudflare-gate.* ]]; then
    rm -rf -- "$GATE_TMP"
  fi
}

trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

pass() {
  printf 'PASS: %s\n' "$*"
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command missing: $1"
}

need_file() {
  [[ -f "$1" ]] || fail "required file missing: $1"
}

need_dir() {
  [[ -d "$1" ]] || fail "required directory missing: $1"
}

wrangler() {
  npx --yes "wrangler@$WRANGLER_VERSION" "$@"
}

assert_config_contract() {
  need_file "$CONFIG_FILE"

  rg -q '"compatibility_date"[[:space:]]*:' "$CONFIG_FILE" \
    || fail "wrangler config has no compatibility_date"
  rg -q '"nodejs_compat"' "$CONFIG_FILE" \
    || fail "wrangler config must enable nodejs_compat"
  rg -q '"run_worker_first"[[:space:]]*:[[:space:]]*\[' "$CONFIG_FILE" \
    || fail "assets.run_worker_first must be a route-pattern array"
  rg -q '"/api/\*"' "$CONFIG_FILE" \
    || fail "assets.run_worker_first must include /api/*"
  rg -q '"not_found_handling"[[:space:]]*:[[:space:]]*"single-page-application"' "$CONFIG_FILE" \
    || fail "static assets must declare SPA not-found handling"
  rg -q '"exports"[[:space:]]*:' "$CONFIG_FILE" \
    || fail "new DO lifecycle must use exports"
  rg -q '"storage"[[:space:]]*:[[:space:]]*"sqlite"' "$CONFIG_FILE" \
    || fail "Journey Durable Object must use SQLite storage"
  if rg -q '"migrations"[[:space:]]*:' "$CONFIG_FILE"; then
    fail "legacy DO migrations and exports are mutually exclusive"
  fi

  for key in d1_databases durable_objects queues; do
    local count
    count="$(rg -o "\"$key\"[[:space:]]*:" "$CONFIG_FILE" | wc -l | tr -d ' ')"
    [[ "$count" -ge 2 ]] \
      || fail "$key must be declared independently for staging and production"
  done

  if rg -n -i \
    '"(api[_-]?key|token|secret|password|private[_-]?key)"[[:space:]]*:[[:space:]]*"[^<][^"]+"' \
    "$CONFIG_FILE"; then
    fail "possible plaintext secret in wrangler config"
  fi

  CONFIG_FILE_FOR_CHECK="$CONFIG_FILE" bun --eval '
    import { readFileSync } from "node:fs";
    import { dirname, relative, resolve } from "node:path";
    const configPath = process.env.CONFIG_FILE_FOR_CHECK;
    if (configPath === undefined) throw new Error("CONFIG_PATH_MISSING");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    if ("migrations" in config) throw new Error("LEGACY_MIGRATIONS");
    const lifecycle = config.exports?.JourneyDurableObject;
    if (lifecycle?.type !== "durable-object" || lifecycle?.storage !== "sqlite") {
      throw new Error("DO_EXPORT_INVALID");
    }
    const assetsDirectory = resolve(dirname(configPath), config.assets?.directory ?? "");
    const serverEntry = resolve(dirname(configPath), config.main ?? "");
    const overlap = relative(assetsDirectory, serverEntry);
    if (overlap === "" || (!overlap.startsWith("../") && overlap !== "..")) {
      throw new Error("ASSET_SERVER_OVERLAP");
    }
    const environments = [
      ["local", config],
      ["staging", config.env?.staging],
      ["production", config.env?.production],
    ];
    const identities = new Set();
    for (const [name, environment] of environments) {
      const database = environment?.d1_databases?.[0]?.database_name;
      const queue = environment?.queues?.producers?.[0]?.queue;
      const deadLetterQueue = environment?.queues?.consumers?.[0]?.dead_letter_queue;
      const durableObject = environment?.durable_objects?.bindings?.[0];
      if (environment?.vars?.ENVIRONMENT !== name || database === undefined ||
          queue === undefined || deadLetterQueue === undefined ||
          durableObject?.name !== "JOURNEYS" ||
          durableObject?.class_name !== "JourneyDurableObject") {
        throw new Error("ENVIRONMENT_BINDING_MISSING");
      }
      for (const identity of [database, queue, deadLetterQueue]) {
        if (identities.has(identity)) throw new Error("ENVIRONMENT_BINDING_REUSE");
        identities.add(identity);
      }
    }
    if (config.observability?.enabled !== false ||
        config.observability?.logs?.invocation_logs !== false ||
        config.observability?.traces?.enabled !== false) {
      throw new Error("OBSERVABILITY_IDENTITY_LEAK");
    }
  '

  pass "Wrangler configuration contract"
}

assert_static_limits() {
  local dist_dir="$APP_DIR/dist"
  need_dir "$dist_dir"

  local asset_count
  local largest_asset
  asset_count="$(find "$dist_dir" -type f | wc -l | tr -d ' ')"
  largest_asset="$(find "$dist_dir" -type f -printf '%s\n' | sort -nr | sed -n '1p')"
  largest_asset="${largest_asset:-0}"

  [[ "$asset_count" -le 20000 ]] \
    || fail "Static Assets Free limit exceeded: $asset_count files > 20,000"
  [[ "$largest_asset" -le 26214400 ]] \
    || fail "Static Assets file limit exceeded: $largest_asset bytes > 25 MiB"

  pass "Static Assets limits ($asset_count files; largest $largest_asset bytes)"
}

run_selftest() {
  need_command bash
  need_command bun
  need_command curl
  need_command find
  need_command npx
  need_command rg
  need_command sort

  local version
  version="$(wrangler --version)"
  [[ "$version" == "$WRANGLER_VERSION" ]] \
    || fail "expected Wrangler $WRANGLER_VERSION, got $version"

  pass "gate harness and Wrangler $version"
}

run_preflight() {
  local environment="$1"
  [[ "$environment" == "staging" || "$environment" == "production" ]] \
    || fail "preflight environment must be staging or production"

  run_selftest
  need_dir "$SERVER_DIR"
  need_dir "$CONTRACTS_DIR"
  need_file "$ROOT_DIR/package.json"
  need_file "$SERVER_DIR/package.json"
  need_file "$CONTRACTS_DIR/package.json"
  assert_config_contract

  bun run --cwd "$CONTRACTS_DIR" typecheck
  bun run --cwd "$CONTRACTS_DIR" test
  bun run --cwd "$SERVER_DIR" check
  bun run --cwd "$SERVER_DIR" test
  bun run --cwd "$APP_DIR" build
  assert_static_limits

  GATE_TMP="$(mktemp -d -t somewhere-cloudflare-gate.XXXXXXXX)"

  wrangler types "$GATE_TMP/$environment.d.ts" \
    --config "$CONFIG_FILE" \
    --env "$environment"
  rg -q 'DB[?]?:[[:space:]]*D1Database' "$GATE_TMP/$environment.d.ts" \
    || fail "generated $environment Env has no D1 DB binding"
  rg -q 'JOURNEYS[?]?:[[:space:]]*DurableObjectNamespace' "$GATE_TMP/$environment.d.ts" \
    || fail "generated $environment Env has no JOURNEYS DO binding"
  rg -q 'EVENTS_QUEUE[?]?:[[:space:]]*Queue' "$GATE_TMP/$environment.d.ts" \
    || fail "generated $environment Env has no EVENTS_QUEUE binding"

  wrangler deploy \
    --config "$CONFIG_FILE" \
    --env "$environment" \
    --dry-run \
    --outdir "$GATE_TMP/$environment-build"

  pass "$environment compile, binding types, tests, build, and deploy dry-run"
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

usage() {
  cat <<'USAGE'
Usage:
  cloudflare-acceptance-gates.sh selftest
  cloudflare-acceptance-gates.sh config-contract
  cloudflare-acceptance-gates.sh preflight <staging|production>
  D1_DATABASE_NAME=<exact-name> cloudflare-acceptance-gates.sh remote-read <staging|production>
  BASE_URL=https://<approved-host> cloudflare-acceptance-gates.sh postdeploy

The script performs no deployment, migration, resource creation, secret write,
or restore. Those external writes require explicit authorization and the
ordered runbook in cloudflare-free-first-architecture-memo.md.
USAGE
}

main() {
  local command="${1:-}"
  case "$command" in
    selftest)
      [[ "$#" -eq 1 ]] || fail "selftest accepts no extra arguments"
      run_selftest
      ;;
    config-contract)
      [[ "$#" -eq 1 ]] || fail "config-contract accepts no extra arguments"
      need_command bun
      need_command rg
      assert_config_contract
      ;;
    preflight)
      [[ "$#" -eq 2 ]] || fail "preflight requires one environment"
      run_preflight "$2"
      ;;
    remote-read)
      [[ "$#" -eq 2 ]] || fail "remote-read requires one environment"
      run_remote_read "$2"
      ;;
    postdeploy)
      [[ "$#" -eq 1 ]] || fail "postdeploy accepts no extra arguments"
      run_postdeploy
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
