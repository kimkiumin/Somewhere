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
  GATE_TMP="$(mktemp -d -t somewhere-cloudflare-gate.XXXXXXXX)"

  bun run --cwd "$CONTRACTS_DIR" typecheck
  bun run --cwd "$CONTRACTS_DIR" test
  bun run --cwd "$SERVER_DIR" check
  bun run --cwd "$SERVER_DIR" test -- --configLoader runner --maxWorkers=1
  (
    cd "$APP_DIR"
    bun --bun "$ROOT_DIR/node_modules/.bin/vite" build \
      --config "$APP_DIR/vite.config.ts" \
      --configLoader runner \
      --base / \
      --outDir "$GATE_TMP/app-dist"
  )
  bun "$APP_DIR/scripts/assert-precache-unique.mjs" "$GATE_TMP/app-dist" production
  assert_static_limits "$GATE_TMP/app-dist"

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
    --assets "$GATE_TMP/app-dist" \
    --dry-run \
    --outdir "$GATE_TMP/$environment-build"

  pass "$environment compile, binding types, tests, build, and deploy dry-run"
}

run_deployment_secret_check() {
  local environment="$1"
  local required_secret="CANONICAL_ORIGIN"
  [[ "$environment" == "staging" || "$environment" == "production" ]] \
    || fail "deployment-secret-check environment must be staging or production"

  run_selftest
  need_file "$CONFIG_FILE"
  GATE_TMP="$(mktemp -d -t somewhere-cloudflare-gate.XXXXXXXX)"
  if ! wrangler secret list \
    --config "$CONFIG_FILE" \
    --env "$environment" \
    --format json > "$GATE_TMP/worker-secrets.json"; then
    fail "could not verify remote Worker secrets for $environment"
  fi
  if ! SECRET_LIST_FILE="$GATE_TMP/worker-secrets.json" \
    REQUIRED_SECRET="$required_secret" bun --eval '
      import { readFileSync } from "node:fs";
      const secrets = JSON.parse(readFileSync(process.env.SECRET_LIST_FILE, "utf8"));
      const required = process.env.REQUIRED_SECRET;
      if (!Array.isArray(secrets) ||
          secrets.filter((secret) =>
            secret !== null &&
            typeof secret === "object" &&
            secret.name === required
          ).length !== 1) {
        process.exit(1);
      }
    '; then
    fail "required remote Worker secret missing: $required_secret"
  fi

  pass "$environment remote Worker secret exists: $required_secret"
}

run_lifecycle_contract() {
  local prior_config="$1"
  local environment="$2"
  [[ "$environment" == "staging" || "$environment" == "production" ]] \
    || fail "lifecycle environment must be staging or production"
  need_file "$prior_config"
  PRIOR_CONFIG="$prior_config" CURRENT_CONFIG="$CONFIG_FILE" TARGET_ENV="$environment" bun --eval '
    import { readFileSync } from "node:fs";
    const prior = JSON.parse(readFileSync(process.env.PRIOR_CONFIG, "utf8"));
    const current = JSON.parse(readFileSync(process.env.CURRENT_CONFIG, "utf8"));
    const target = process.env.TARGET_ENV;
    const lifecycle = (value) => ({
      exports: value.exports ?? null,
      binding: value.env?.[target]?.durable_objects?.bindings ?? null,
    });
    if (JSON.stringify(lifecycle(prior)) !== JSON.stringify(lifecycle(current))) {
      throw new Error("DO_LIFECYCLE_CHANGE_REQUIRES_SEPARATE_ATOMIC_RELEASE");
    }
    if ("migrations" in current) throw new Error("LEGACY_MIGRATIONS");
  '
  pass "$environment prior lifecycle snapshot is unchanged"
}

run_database_name() {
  local environment="$1"
  [[ "$environment" == "staging" ]] \
    || fail "database-name is restricted to staging"
  CONFIG_FILE_FOR_CHECK="$CONFIG_FILE" TARGET_ENV="$environment" bun --eval '
    import { readFileSync } from "node:fs";
    const config = JSON.parse(readFileSync(process.env.CONFIG_FILE_FOR_CHECK, "utf8"));
    const databases = config.env?.[process.env.TARGET_ENV]?.d1_databases;
    if (!Array.isArray(databases) || databases.length !== 1 ||
        databases[0]?.binding !== "DB" ||
        typeof databases[0]?.database_name !== "string") process.exit(1);
    console.log(databases[0].database_name);
  '
}
