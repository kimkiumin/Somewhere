readonly WRANGLER_VERSION="4.115.0"
readonly DEFAULT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
readonly ROOT_DIR="${SOMEWHERE_ROOT:-$DEFAULT_ROOT}"
readonly SERVER_DIR="$ROOT_DIR/server"
readonly APP_DIR="$ROOT_DIR/app"
readonly CONTRACTS_DIR="$ROOT_DIR/contracts"
readonly CONFIG_FILE="$SERVER_DIR/wrangler.jsonc"
readonly WRANGLER_BIN="$ROOT_DIR/node_modules/.bin/wrangler"
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
  need_file "$WRANGLER_BIN"
  "$WRANGLER_BIN" "$@"
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
    if (config.observability?.logs?.invocation_logs !== false ||
        config.observability?.traces?.enabled !== false) {
      throw new Error("OBSERVABILITY_IDENTITY_LEAK");
    }
  '

  pass "Wrangler configuration contract"
}

assert_static_limits() {
  local dist_dir="${1:-$APP_DIR/dist}"
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
  need_command rg
  need_command sort
  need_file "$WRANGLER_BIN"

  local version
  version="$(wrangler --version)"
  [[ "$version" == "$WRANGLER_VERSION" ]] \
    || fail "expected Wrangler $WRANGLER_VERSION, got $version"

  pass "gate harness and Wrangler $version"
}
