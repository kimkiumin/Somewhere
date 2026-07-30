#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/lib/cloudflare-gate-common.sh"
source "$SCRIPT_DIR/lib/cloudflare-gate-build.sh"
source "$SCRIPT_DIR/lib/cloudflare-gate-remote.sh"

usage() {
  cat <<'USAGE'
Usage:
  cloudflare-acceptance-gates.sh selftest
  cloudflare-acceptance-gates.sh config-contract
  cloudflare-acceptance-gates.sh lifecycle-contract <prior-wrangler.jsonc> <staging|production>
  cloudflare-acceptance-gates.sh database-name staging
  cloudflare-acceptance-gates.sh preflight <staging|production>
  cloudflare-acceptance-gates.sh deployment-secret-check <staging|production>
  D1_DATABASE_NAME=<exact-name> cloudflare-acceptance-gates.sh fence-check staging
  D1_DATABASE_NAME=<exact-name> cloudflare-acceptance-gates.sh drain-check staging
  D1_DATABASE_NAME=<exact-name> cloudflare-acceptance-gates.sh remote-read <staging|production>
  BASE_URL=https://<approved-host> cloudflare-acceptance-gates.sh postdeploy
  BASE_URL=https://<approved-host> cloudflare-acceptance-gates.sh resume-check

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
    lifecycle-contract)
      [[ "$#" -eq 3 ]] || fail "lifecycle-contract requires prior config and environment"
      run_lifecycle_contract "$2" "$3"
      ;;
    database-name)
      [[ "$#" -eq 2 ]] || fail "database-name requires one environment"
      run_database_name "$2"
      ;;
    preflight)
      [[ "$#" -eq 2 ]] || fail "preflight requires one environment"
      run_preflight "$2"
      ;;
    deployment-secret-check)
      [[ "$#" -eq 2 ]] || fail "deployment-secret-check requires one environment"
      run_deployment_secret_check "$2"
      ;;
    fence-check)
      [[ "$#" -eq 2 ]] || fail "fence-check requires one environment"
      run_remote_sql_check "fence-check" "$2"
      ;;
    drain-check)
      [[ "$#" -eq 2 ]] || fail "drain-check requires one environment"
      run_remote_sql_check "drain-check" "$2"
      ;;
    remote-read)
      [[ "$#" -eq 2 ]] || fail "remote-read requires one environment"
      run_remote_read "$2"
      ;;
    postdeploy)
      [[ "$#" -eq 1 ]] || fail "postdeploy accepts no extra arguments"
      run_postdeploy
      ;;
    resume-check)
      [[ "$#" -eq 1 ]] || fail "resume-check accepts no extra arguments"
      run_resume_check
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
