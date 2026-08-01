import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import {
  mainBoundary,
  parseArguments,
  writeJson,
} from "./lib/release-core.mjs";

const specification = {
  required: ["--ci", "--staging", "--wrangler", "--output"],
};
const workflowSchema = z
  .object({
    name: z.string().min(1),
    on: z.union([z.string(), z.array(z.string()), z.record(z.string(), z.unknown())]),
    permissions: z.record(z.string(), z.string()),
    jobs: z.record(
      z.string(),
      z
        .object({
          environment: z.union([z.string(), z.object({ name: z.string() }).passthrough()]).optional(),
          permissions: z.record(z.string(), z.string()).optional(),
          steps: z.array(z.record(z.string(), z.unknown())),
        })
        .passthrough(),
    ),
  })
  .passthrough();
const wranglerSchema = z
  .object({
    exports: z.record(
      z.string(),
      z.object({ type: z.string(), storage: z.string().optional() }).passthrough(),
    ),
    env: z.record(z.string(), z.record(z.string(), z.unknown())),
  })
  .passthrough();
const requiredStageIds = ["fence", "drain", "backup", "expand", "deploy", "smoke", "resume"];

function events(value) {
  if (typeof value === "string") return new Set([value]);
  if (Array.isArray(value)) return new Set(value);
  return new Set(Object.keys(value));
}

function workflowText(workflow) {
  return JSON.stringify(workflow);
}

function runText(workflow) {
  return Object.values(workflow.jobs)
    .flatMap((job) => job.steps)
    .flatMap((step) => typeof step.run === "string" ? [step.run] : [])
    .join("\n");
}

function actionPinsValid(workflow) {
  return Object.values(workflow.jobs)
    .flatMap((job) => job.steps)
    .flatMap((step) => typeof step.uses === "string" ? [step.uses] : [])
    .every((value) => /@[a-f0-9]{40}$/u.test(value));
}

function readEnvironmentName(job) {
  if (typeof job.environment === "string") return job.environment;
  return job.environment?.name;
}

function assertCi(workflow) {
  const triggers = events(workflow.on);
  const text = workflowText(workflow);
  const commands = runText(workflow);
  if (
    !triggers.has("pull_request")
    || !triggers.has("push")
    || workflow.permissions.contents !== "read"
    || Object.values(workflow.permissions).some((value) => value !== "read" && value !== "none")
    || text.includes("secrets.")
    || !actionPinsValid(workflow)
  ) {
    throw new TypeError("CI_EVENT_PERMISSION_OR_PIN_UNSAFE");
  }
  const pinnedPlaywrightInstall = Object.values(workflow.jobs)
    .flatMap((job) => job.steps)
    .some((step) =>
      step["working-directory"] === "app"
      && step.run?.trim() === "bunx --no-install playwright install --with-deps chromium webkit"
    );
  if (!pinnedPlaywrightInstall) {
    throw new TypeError("CI_GATE_MISSING:playwright install --with-deps chromium webkit");
  }
  for (const required of [
    "apt-get install -y ripgrep",
    "verify:v2",
    "validate-evidence.mjs",
    "--mode schema",
    "--mode release",
    "bun audit",
    "build:production",
    "scan-production.mjs",
    "validate-ci-verdict.mjs",
  ]) {
    if (!commands.includes(required)) throw new TypeError(`CI_GATE_MISSING:${required}`);
  }
}

function assertStaging(workflow) {
  const triggers = events(workflow.on);
  const jobs = Object.values(workflow.jobs);
  const text = workflowText(workflow);
  const stageJob = jobs.find((job) => readEnvironmentName(job) === "somewhere-v2-staging");
  if (
    triggers.size !== 1
    || !triggers.has("workflow_dispatch")
    || stageJob === undefined
    || !actionPinsValid(workflow)
    || text.includes("pull_request")
  ) {
    throw new TypeError("STAGING_AUTHORIZATION_BOUNDARY_UNSAFE");
  }
  const ids = stageJob.steps.flatMap((step) => typeof step.id === "string" ? [step.id] : []);
  const positions = requiredStageIds.map((id) => ids.indexOf(id));
  if (
    positions.some((index) => index < 0)
    || positions.some((index, position) => position > 0 && index <= positions[position - 1])
  ) {
    throw new TypeError("STAGING_RELEASE_ORDER_UNSAFE");
  }
  const commands = runText(workflow);
  const deployStep = stageJob.steps.find((step) => step.id === "deploy");
  const deployCommands = typeof deployStep?.run === "string" ? deployStep.run : "";
  const secretCheckPosition = deployCommands.indexOf("deployment-secret-check staging");
  const deployPosition = deployCommands.indexOf("node_modules/.bin/wrangler deploy");
  const inputs = workflow.on.workflow_dispatch?.inputs;
  if (
    /wrangler\s+(?:versions|rollback|deployments)\b|--percentage\b|--command\b/iu.test(commands)
    || commands.includes("${{ inputs.")
    || !commands.includes("lifecycle-contract")
    || inputs?.prior_config_sha256 === undefined
    || inputs?.release_tag === undefined
    || inputs?.repository_verdict_b64 === undefined
    || inputs?.repository_verdict_sha256 === undefined
    || inputs?.terminal_manifest_b64 === undefined
    || inputs?.terminal_manifest_sha256 === undefined
    || inputs?.fence_receipt_sha256 === undefined
    || inputs?.database_name !== undefined
    || !text.includes("vars.STAGING_REPOSITORY_VERDICT_SHA256")
    || !text.includes("vars.STAGING_TERMINAL_MANIFEST_SHA256")
    || !commands.includes("merge-base --is-ancestor")
    || !commands.includes("refs/tags/$RELEASE_TAG")
    || !commands.includes("git for-each-ref --format='%(contents)'")
    || !commands.includes("verify-staging-seal.mjs")
    || !commands.includes("validate-https-origin.mjs --origin \"$BASE_URL\"")
    || !commands.includes("--verdict-sha256 \"$REPOSITORY_VERDICT_SHA256\"")
    || !commands.includes("--manifest-sha256 \"$TERMINAL_MANIFEST_SHA256\"")
    || !commands.includes("build:production")
    || !commands.includes("--environment staging")
    || !commands.includes("scan-production.mjs")
    || !commands.includes("--assets \"$RUNNER_TEMP/staging-build/app/dist\"")
    || !commands.includes("database-name staging")
    || !commands.includes("d1 export")
    || !commands.includes("openssl cms -encrypt")
    || !commands.includes("database.sql.cms")
    || !commands.includes("staging-private/database.sql")
    || !commands.includes("d1 migrations apply")
    || !commands.includes("wrangler deploy")
    || secretCheckPosition < 0
    || deployPosition <= secretCheckPosition
    || !commands.includes("postdeploy")
  ) {
    throw new TypeError("STAGING_LIFECYCLE_OR_MIGRATION_UNSAFE");
  }
}

function environmentIdentities(config, name) {
  const environment = config.env[name];
  const d1 = Array.isArray(environment.d1_databases) ? environment.d1_databases : [];
  const queues = typeof environment.queues === "object" && environment.queues !== null
    ? environment.queues
    : {};
  const producers = Array.isArray(queues.producers) ? queues.producers : [];
  const consumers = Array.isArray(queues.consumers) ? queues.consumers : [];
  const services = Array.isArray(environment.services) ? environment.services : [];
  const durableObjects = Array.isArray(environment.durable_objects?.bindings)
    ? environment.durable_objects.bindings
    : [];
  const identities = [
    environment.name,
    ...d1.map((value) => value.database_name),
    ...producers.map((value) => value.queue),
    ...consumers.flatMap((value) => [value.queue, value.dead_letter_queue]),
    ...services.map((value) => value.service),
    ...durableObjects.map((value) => `${environment.name}:${value.name}:${value.class_name}`),
  ];
  if (identities.some((value) => typeof value !== "string" || value.length === 0)) {
    throw new TypeError(`ENVIRONMENT_BINDING_MISSING:${name}`);
  }
  return new Set(identities);
}

async function validate(options) {
  const ciPath = resolve(options.ci);
  const stagingPath = resolve(options.staging);
  const [ci, staging, config] = await Promise.all([
    readFile(ciPath, "utf8").then((value) => workflowSchema.parse(parse(value))),
    readFile(stagingPath, "utf8").then((value) => workflowSchema.parse(parse(value))),
    readFile(resolve(options.wrangler), "utf8").then((value) => wranglerSchema.parse(JSON.parse(value))),
  ]);
  assertCi(ci);
  assertStaging(staging);
  const stagingIdentities = environmentIdentities(config, "staging");
  const productionIdentities = environmentIdentities(config, "production");
  if ([...stagingIdentities].some((identity) => productionIdentities.has(identity))) {
    throw new TypeError("ENVIRONMENT_BINDING_REUSE");
  }
  const lifecycle = config.exports.JourneyDurableObject;
  if (lifecycle?.type !== "durable-object" || lifecycle.storage !== "sqlite") {
    throw new TypeError("DO_LIFECYCLE_UNSAFE");
  }
  const legacy = await readFile(resolve(dirname(dirname(ciPath)), "workflows/app.yml"), "utf8");
  if (
    legacy.includes("actions/deploy-pages")
    || legacy.includes("actions/upload-pages-artifact")
    || legacy.includes("pages: write")
  ) {
    throw new TypeError("HISTORICAL_PAGES_MUTABLE");
  }
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate: "PASS",
    schemaValid: true,
    pullRequestSecretsExposed: false,
    stagingEnvironmentProtected: true,
    stagingProtectionLevel: "DECLARED_ONLY",
    externalProtectionVerified: false,
    externalWriteInLocalMode: false,
    lifecycleGradualRollbackAllowed: false,
    historicalPagesFrozen: true,
    environmentBindingsDistinct: true,
    orderedStages: requiredStageIds,
  });
  process.stdout.write("PASS: workflow safety validated\n");
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => validate(parsed), parsed.output);
