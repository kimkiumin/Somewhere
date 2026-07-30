import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writeJson } from "./release-testkit.mjs";

export const repo = resolve(import.meta.dir, "../../..");
export const unsafeFixtures = [
  ["false-pass-missing-credential", "FALSE_RELEASE_PASS_WITHOUT_CREDENTIAL"],
  ["shared-environment-binding", "ENVIRONMENT_BINDING_REUSE"],
  ["lifecycle-gradual-rollback", "DO_LIFECYCLE_ROLLBACK_UNSAFE"],
  ["migration-without-backup", "MIGRATION_BACKUP_MISSING"],
  ["private-cache-leak", "PRIVATE_RESPONSE_CACHEABLE"],
  ["fork-secret-exposure", "UNTRUSTED_EVENT_SECRET_EXPOSURE"],
];

export async function writeFakeWrangler(root) {
  const fakeWrangler = resolve(root, "node_modules/.bin/wrangler");
  const fakeConfig = resolve(root, "server/wrangler.jsonc");
  await mkdir(resolve(root, "node_modules/.bin"), { recursive: true });
  await mkdir(resolve(root, "server"), { recursive: true });
  await writeFile(fakeConfig, await readFile(resolve(repo, "server/wrangler.jsonc")));
  await writeFile(fakeWrangler, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_WRANGLER_CALL_LOG"
if [[ "\${1:-}" == "--version" ]]; then
  printf '%s\\n' '4.115.0'
  exit 0
fi
if [[ "\${1:-} \${2:-}" == "secret list" ]]; then
  printf '%s\\n' "\${FAKE_SECRET_LIST:-[]}"
  exit 0
fi
if [[ "\${1:-}" == "deploy" ]]; then
  : > "$FAKE_DEPLOY_MARKER"
  exit 0
fi
exit 2
`);
  await chmod(fakeWrangler, 0o755);
}

export async function writePassingWorkflowVerdict(path) {
  await writeJson(path, {
    gate: "PASS",
    schemaValid: true,
    pullRequestSecretsExposed: false,
    stagingEnvironmentProtected: true,
    externalProtectionVerified: false,
    externalWriteInLocalMode: false,
    lifecycleGradualRollbackAllowed: false,
    historicalPagesFrozen: true,
    environmentBindingsDistinct: true,
  });
}

export async function readGateSourceBundle() {
  const paths = [
    "scripts/release/cloudflare-acceptance-gates.sh",
    "scripts/release/lib/cloudflare-gate-common.sh",
    "scripts/release/lib/cloudflare-gate-build.sh",
    "scripts/release/lib/cloudflare-gate-remote.sh",
  ];
  const parts = await Promise.all(paths.map(async (path) => {
    const file = Bun.file(resolve(repo, path));
    return await file.exists() ? file.text() : "";
  }));
  return parts.join("\n");
}
