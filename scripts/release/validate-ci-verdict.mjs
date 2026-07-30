import { resolve } from "node:path";
import { z } from "zod";
import {
  assertHex,
  mainBoundary,
  parseArguments,
  readJson,
  writeJson,
} from "./lib/release-core.mjs";

const specification = {
  required: [
    "--mode",
    "--source-tree",
    "--fixture",
    "--workflow-verdict",
    "--expect-repository",
    "--expect-release",
    "--output",
  ],
};
const gate = z.enum(["PASS", "BLOCK"]);
const fixtureSchema = z
  .object({
    schemaVersion: z.literal(1),
    declaredReleaseReady: gate,
    repositoryChecks: z
      .object({
        verifyV2: z.boolean(),
        fieldSchema: z.boolean(),
        dependencyAudit: z.boolean(),
        workerDryRun: z.boolean(),
        productionScan: z.boolean(),
      })
      .strict(),
    externalGates: z
      .object({
        cloudflareCredential: gate,
        cloudflareProductionPitr: gate,
        githubEnvironmentProtection: gate,
        physicalIPhone: gate,
        providerRightsQuota: gate,
        koreanPrivacyLocationReview: gate,
      })
      .strict(),
    safeguards: z
      .object({
        environmentBindingsDistinct: z.boolean(),
        lifecycleGradualRollback: z.boolean(),
        migrationBackup: z.boolean(),
        privateResponsesNoStore: z.boolean(),
        untrustedEventSecrets: z.boolean(),
      })
      .strict(),
    externalWrites: z.literal(0),
  })
  .strict();
const workflowSchema = z
  .object({
    gate: z.literal("PASS"),
    schemaValid: z.literal(true),
    pullRequestSecretsExposed: z.literal(false),
    stagingEnvironmentProtected: z.literal(true),
    externalProtectionVerified: z.literal(false),
    externalWriteInLocalMode: z.literal(false),
    lifecycleGradualRollbackAllowed: z.literal(false),
    historicalPagesFrozen: z.literal(true),
    environmentBindingsDistinct: z.literal(true),
  })
  .passthrough();
const externalCodes = {
  cloudflareCredential: "CLOUDFLARE_CREDENTIAL_PASS",
  cloudflareProductionPitr: "CLOUDFLARE_PRODUCTION_PITR_PASS",
  githubEnvironmentProtection: "GITHUB_ENVIRONMENT_PROTECTION_PASS",
  physicalIPhone: "PHYSICAL_IPHONE_PASS",
  providerRightsQuota: "PROVIDER_RIGHTS_QUOTA_PASS",
  koreanPrivacyLocationReview: "KOREAN_PRIVACY_LOCATION_REVIEW_PASS",
};

async function validate(options) {
  if (options.mode !== "repository") throw new TypeError("mode must be repository");
  assertHex(options["source-tree"], 40, "source-tree");
  if (options["expect-repository"] !== "PASS" || options["expect-release"] !== "BLOCK") {
    throw new TypeError("repository mode requires PASS/BLOCK expectation");
  }
  const fixture = fixtureSchema.parse(await readJson(resolve(options.fixture)));
  workflowSchema.parse(await readJson(resolve(options["workflow-verdict"])));
  const failures = [];
  if (Object.values(fixture.repositoryChecks).some((value) => !value)) {
    failures.push("REPOSITORY_CHECK_MISSING");
  }
  if (fixture.declaredReleaseReady === "PASS"
    && Object.values(fixture.externalGates).some((value) => value === "BLOCK")) {
    failures.push("FALSE_RELEASE_PASS_WITHOUT_CREDENTIAL");
  }
  if (!fixture.safeguards.environmentBindingsDistinct) failures.push("ENVIRONMENT_BINDING_REUSE");
  if (fixture.safeguards.lifecycleGradualRollback) failures.push("DO_LIFECYCLE_ROLLBACK_UNSAFE");
  if (!fixture.safeguards.migrationBackup) failures.push("MIGRATION_BACKUP_MISSING");
  if (!fixture.safeguards.privateResponsesNoStore) failures.push("PRIVATE_RESPONSE_CACHEABLE");
  if (fixture.safeguards.untrustedEventSecrets) failures.push("UNTRUSTED_EVENT_SECRET_EXPOSURE");
  const blockingGates = Object.entries(fixture.externalGates)
    .flatMap(([name, value]) => value === "BLOCK" ? [externalCodes[name]] : []);
  const repositoryReady = failures.length === 0 ? "PASS" : "FAIL";
  const releaseReady = repositoryReady === "PASS" && blockingGates.length === 0 ? "PASS" : "BLOCK";
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    sourceTree: options["source-tree"],
    repositoryReady,
    releaseReady,
    blockingGates,
    failingGates: failures,
    externalWrites: 0,
  });
  if (repositoryReady !== "PASS") {
    process.exitCode = 1;
  } else {
    process.stdout.write("PASS: repository ready; release blocked by external gates\n");
  }
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => validate(parsed), parsed.output);
