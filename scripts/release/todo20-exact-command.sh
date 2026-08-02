set -euo pipefail
SOMEWHERE_CI_TMP=""
cleanup_ci_path() {
  if test -z "$SOMEWHERE_CI_TMP"; then return 0; fi
  case "$SOMEWHERE_CI_TMP" in
    /tmp/somewhere-v2-ci.*) chmod -R u+w "$SOMEWHERE_CI_TMP" 2>/dev/null || true; rm -rf -- "$SOMEWHERE_CI_TMP" ;;
    *) return 97 ;;
  esac
  test ! -e "$SOMEWHERE_CI_TMP"
}
cleanup_ci_exit() {
  SOMEWHERE_ORIGINAL_STATUS=$?
  trap - EXIT HUP INT TERM
  SOMEWHERE_CLEANUP_STATUS=0
  cleanup_ci_path || SOMEWHERE_CLEANUP_STATUS=$?
  if test "$SOMEWHERE_ORIGINAL_STATUS" -eq 0 -a "$SOMEWHERE_CLEANUP_STATUS" -eq 0; then
    printf '%s\n' 'PASS: zero external writes; temp removed; no credential created' \
      > "$SOMEWHERE_EVIDENCE_ROOT/task-20-cleanup.txt"
  fi
  if test "$SOMEWHERE_ORIGINAL_STATUS" -ne 0; then exit "$SOMEWHERE_ORIGINAL_STATUS"; fi
  exit "$SOMEWHERE_CLEANUP_STATUS"
}
cleanup_ci_signal() {
  SOMEWHERE_SIGNAL_STATUS="$1"
  trap - EXIT HUP INT TERM
  cleanup_ci_path || true
  exit "$SOMEWHERE_SIGNAL_STATUS"
}
trap cleanup_ci_exit EXIT
trap 'cleanup_ci_signal 129' HUP
trap 'cleanup_ci_signal 130' INT
trap 'cleanup_ci_signal 143' TERM
SOMEWHERE_CI_TMP="$(mktemp -d -t somewhere-v2-ci.XXXXXXXX)"
SOMEWHERE_REPO="${SOMEWHERE_MATERIALIZED_SOURCE:?}"
SOMEWHERE_TASK_TREE="${SOMEWHERE_SOURCE_TREE:?}"
test -n "${SOMEWHERE_EVIDENCE_ROOT:-}"
case "$SOMEWHERE_EVIDENCE_ROOT" in "$SOMEWHERE_REPO"|"$SOMEWHERE_REPO"/*) exit 97 ;; esac
mkdir -p "$SOMEWHERE_EVIDENCE_ROOT/task-20/unsafe"
run_clean() {
  env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_API_KEY -u CLOUDFLARE_EMAIL \
    -u CLOUDFLARE_ACCOUNT_ID -u CLOUDFLARE_ZONE_ID \
    -u CF_API_TOKEN -u CF_API_KEY -u CF_API_EMAIL \
    -u CLOUDFLARE_ACCESS_CLIENT_ID -u CLOUDFLARE_ACCESS_CLIENT_SECRET \
    -u CLOUDFLARE_API_BASE_URL \
    XDG_CONFIG_HOME="$SOMEWHERE_CI_TMP/xdg" \
    WRANGLER_HOME="$SOMEWHERE_CI_TMP/wrangler-home" \
    WRANGLER_SEND_METRICS=false "$@"
}
test -n "$SOMEWHERE_REPO" -a -n "$SOMEWHERE_TASK_TREE"
run_clean bun scripts/release/validate-workflows.mjs \
    --ci .github/workflows/v2-ci.yml --staging .github/workflows/v2-staging.yml \
    --wrangler server/wrangler.jsonc \
    --output "$SOMEWHERE_EVIDENCE_ROOT/task-20/workflow-verdict.json" \
  2>&1 | tee "$SOMEWHERE_EVIDENCE_ROOT/task-20-workflow-green.txt"
jq -e '.schemaValid and (.pullRequestSecretsExposed|not) and
  .stagingEnvironmentProtected and (.externalWriteInLocalMode|not) and
  (.lifecycleGradualRollbackAllowed|not)' "$SOMEWHERE_EVIDENCE_ROOT/task-20/workflow-verdict.json"
run_clean bun scripts/release/validate-ci-verdict.mjs \
    --mode repository --source-tree "$SOMEWHERE_TASK_TREE" \
    --fixture scripts/release/fixtures/ci/repository-ready-release-blocked.json \
    --workflow-verdict "$SOMEWHERE_EVIDENCE_ROOT/task-20/workflow-verdict.json" \
    --expect-repository PASS --expect-release BLOCK \
    --output "$SOMEWHERE_EVIDENCE_ROOT/task-20/release-verdict.json" \
  2>&1 | tee "$SOMEWHERE_EVIDENCE_ROOT/task-20-verdict-green.txt"
jq -e '.repositoryReady=="PASS" and .releaseReady=="BLOCK" and
  (.blockingGates|index("CLOUDFLARE_CREDENTIAL_PASS"))!=null and .externalWrites==0' \
  "$SOMEWHERE_EVIDENCE_ROOT/task-20/release-verdict.json"
run_clean env SOMEWHERE_ROOT="$SOMEWHERE_REPO" bash scripts/release/cloudflare-acceptance-gates.sh selftest \
  2>&1 | tee "$SOMEWHERE_EVIDENCE_ROOT/task-20-selftest-green.txt"
run_clean env SOMEWHERE_ROOT="$SOMEWHERE_REPO" bash scripts/release/cloudflare-acceptance-gates.sh preflight staging \
  2>&1 | tee "$SOMEWHERE_EVIDENCE_ROOT/task-20-staging-green.txt"
run_clean env SOMEWHERE_ROOT="$SOMEWHERE_REPO" bash scripts/release/cloudflare-acceptance-gates.sh preflight production \
  2>&1 | tee "$SOMEWHERE_EVIDENCE_ROOT/task-20-production-green.txt"
for SOMEWHERE_PAIR in \
  false-pass-missing-credential:FALSE_RELEASE_PASS_WITHOUT_CREDENTIAL \
  shared-environment-binding:ENVIRONMENT_BINDING_REUSE \
  lifecycle-gradual-rollback:DO_LIFECYCLE_ROLLBACK_UNSAFE \
  migration-without-backup:MIGRATION_BACKUP_MISSING \
  private-cache-leak:PRIVATE_RESPONSE_CACHEABLE \
  fork-secret-exposure:UNTRUSTED_EVENT_SECRET_EXPOSURE
do
  SOMEWHERE_FIXTURE="${SOMEWHERE_PAIR%%:*}"; SOMEWHERE_CODE="${SOMEWHERE_PAIR#*:}"
  set +e
  run_clean bun scripts/release/validate-ci-verdict.mjs --mode repository \
    --source-tree "$SOMEWHERE_TASK_TREE" \
    --fixture "scripts/release/fixtures/ci/$SOMEWHERE_FIXTURE.json" \
    --workflow-verdict "$SOMEWHERE_EVIDENCE_ROOT/task-20/workflow-verdict.json" \
    --expect-repository PASS --expect-release BLOCK \
    --output "$SOMEWHERE_EVIDENCE_ROOT/task-20/unsafe/$SOMEWHERE_FIXTURE.json"
  SOMEWHERE_STATUS=$?
  set -e
  test "$SOMEWHERE_STATUS" -eq 1
  jq -e --arg code "$SOMEWHERE_CODE" \
    '.repositoryReady=="FAIL" and (.failingGates|index($code))!=null and .externalWrites==0' \
    "$SOMEWHERE_EVIDENCE_ROOT/task-20/unsafe/$SOMEWHERE_FIXTURE.json"
done
for SOMEWHERE_SIGNAL in HUP INT TERM; do
  set +e
  bash scripts/release/test-ci-cleanup-trap.sh \
    --signal "$SOMEWHERE_SIGNAL" \
    --receipt "$SOMEWHERE_EVIDENCE_ROOT/task-20/cleanup-$SOMEWHERE_SIGNAL.json"
  SOMEWHERE_SIGNAL_STATUS=$?
  set -e
  case "$SOMEWHERE_SIGNAL:$SOMEWHERE_SIGNAL_STATUS" in HUP:129|INT:130|TERM:143) ;; *) exit 96 ;; esac
  jq -e '.tempRemoved==true and .handlerTerminated==true' \
    "$SOMEWHERE_EVIDENCE_ROOT/task-20/cleanup-$SOMEWHERE_SIGNAL.json"
done
