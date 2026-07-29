import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";
import {
  ReleaseInputError,
  assertHex,
  mainBoundary,
  parseArguments,
  readJson,
  snapshotRegularFile,
  writeJson,
} from "./lib/release-core.mjs";
import { validateTodo20Provenance } from "./lib/todo20-transcript-boundary.mjs";

const specification = {
  required: ["--receipt", "--evidence-root", "--registry", "--output"],
  optional: ["--source-tree"],
};
const hex = (length) => z.string().regex(new RegExp(`^[a-f0-9]{${length}}$`, "u"));
const artifactSchema = z.object({
  path: z.string().min(1),
  sha256: hex(64),
  bytes: z.number().int().nonnegative(),
}).strict();
const exitClassSchema = z.enum([
  "TDD_RED_NONZERO",
  "GREEN_ZERO",
  "NEGATIVE_PASS_ZERO",
  "MUTATION_CAUGHT_NONZERO",
]);
const receiptSchema = z.object({
  schemaVersion: z.literal(1),
  tree: hex(40),
  inventoryDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  argv: z.array(z.string()).min(1),
  cwd: z.string().min(1),
  exitCode: z.number().int().min(0).max(255),
  exitClass: exitClassSchema,
  expectedClass: exitClassSchema,
  assertion: z.string().min(1),
  artifacts: z.array(artifactSchema),
  dependencies: z.object({
    root: z.string().min(1),
    lockfileSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    paths: z.array(z.string()).length(4),
    readOnly: z.literal(true),
    ephemeralCachePaths: z.array(z.string()).length(4),
    ephemeralWorkPaths: z.tuple([z.literal("server/.wrangler")]),
  }).strict(),
  environment: z.object({
    credentialsScrubbed: z.boolean(),
    cachesIsolated: z.boolean(),
    temporaryFilesystemIsolated: z.boolean(),
    hostCredentialRootsMasked: z.boolean(),
    hostProcessNamespaceMasked: z.boolean(),
    preexistingEvidenceIsolated: z.boolean(),
    temporaryRoot: z.string().min(1),
  }).strict(),
  network: z.object({
    policy: z.enum(["inherit", "deny"]),
    namespaceIsolated: z.boolean(),
    externalConnectSucceeded: z.boolean(),
    traceSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    traceBytes: z.number().int().nonnegative(),
  }).strict(),
  cleanup: z.object({
    sourceUnchanged: z.boolean(),
    temporaryRootRemovedByCaller: z.boolean(),
    runnerTemporaryRootRemoved: z.boolean(),
  }).strict(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
}).strict();
const registrySchema = z.object({
  schemaVersion: z.literal(1),
  artifacts: z.array(z.string().min(1)),
}).strict();
const unsafeCodes = new Map([
  ["false-pass-missing-credential", "FALSE_RELEASE_PASS_WITHOUT_CREDENTIAL"],
  ["shared-environment-binding", "ENVIRONMENT_BINDING_REUSE"],
  ["lifecycle-gradual-rollback", "DO_LIFECYCLE_ROLLBACK_UNSAFE"],
  ["migration-without-backup", "MIGRATION_BACKUP_MISSING"],
  ["private-cache-leak", "PRIVATE_RESPONSE_CACHEABLE"],
  ["fork-secret-exposure", "UNTRUSTED_EVENT_SECRET_EXPOSURE"],
]);

function fail(message) {
  throw new ReleaseInputError(message);
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safePath(root, path) {
  if (isAbsolute(path) || path === "" || path.split("/").includes("..")) {
    fail(`unsafe evidence path: ${path}`);
  }
  const absolute = resolve(root, path);
  const fromRoot = relative(root, absolute);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    fail(`evidence path escapes root: ${path}`);
  }
  return absolute;
}

async function readBoundJson(root, entry) {
  const snapshot = await snapshotRegularFile(safePath(root, entry.path), entry.path);
  if (
    snapshot.sha256.slice(7) !== entry.sha256
    || snapshot.bytes !== entry.bytes
  ) {
    fail(`evidence digest mismatch: ${entry.path}`);
  }
  try {
    return JSON.parse(snapshot.data.toString());
  } catch {
    fail(`evidence is not JSON: ${entry.path}`);
  }
}

async function validate(options) {
  const root = await realpath(options["evidence-root"]);
  const registry = registrySchema.parse(await readJson(resolve(options.registry)));
  const receipt = receiptSchema.parse(await readJson(resolve(options.receipt)));
  if (
    registry.schemaVersion !== 1
    || !Array.isArray(registry.artifacts)
    || registry.artifacts.length !== 17
    || new Set(registry.artifacts).size !== registry.artifacts.length
  ) {
    fail("Todo20 artifact registry must contain exactly 17 unique paths");
  }
  for (const path of registry.artifacts) safePath(root, path);
  if (options["source-tree"] !== undefined) {
    assertHex(options["source-tree"], 40, "source-tree");
    if (receipt.tree !== options["source-tree"]) fail("receipt source tree mismatch");
  }
  if (
    receipt.schemaVersion !== 1
    || !/^[a-f0-9]{40}$/u.test(receipt.tree)
    || receipt.exitCode !== 0
    || receipt.exitClass !== "GREEN_ZERO"
    || receipt.expectedClass !== "GREEN_ZERO"
    || receipt.environment?.credentialsScrubbed !== true
    || receipt.environment?.cachesIsolated !== true
    || receipt.environment?.temporaryFilesystemIsolated !== true
    || receipt.environment?.hostCredentialRootsMasked !== true
    || receipt.environment?.hostProcessNamespaceMasked !== true
    || receipt.environment?.preexistingEvidenceIsolated !== true
    || receipt.network?.policy !== "deny"
    || receipt.network?.namespaceIsolated !== true
    || receipt.network?.externalConnectSucceeded !== false
    || !/^sha256:[a-f0-9]{64}$/u.test(receipt.network?.traceSha256)
    || !Number.isInteger(receipt.network?.traceBytes)
    || receipt.network.traceBytes < 0
    || receipt.cleanup?.sourceUnchanged !== true
    || receipt.cleanup?.temporaryRootRemovedByCaller !== true
    || receipt.cleanup?.runnerTemporaryRootRemoved !== true
    || !equal(receipt.dependencies.paths, [
      "node_modules",
      "app/node_modules",
      "contracts/node_modules",
      "server/node_modules",
    ])
    || !equal(receipt.dependencies.ephemeralCachePaths, [
      "node_modules/.vite-temp",
      "app/node_modules/.vite-temp",
      "contracts/node_modules/.vite-temp",
      "server/node_modules/.vite-temp",
    ])
    || !equal(receipt.dependencies.ephemeralWorkPaths, ["server/.wrangler"])
  ) {
    fail("exact-tree execution boundary is not release-safe");
  }
  if (!Array.isArray(receipt.artifacts)) fail("receipt artifacts are absent");
  const actualPaths = receipt.artifacts.map((entry) => entry.path);
  if (
    new Set(actualPaths).size !== actualPaths.length
    || !equal([...actualPaths].sort(), [...registry.artifacts].sort())
  ) {
    fail("receipt does not bind the exact Todo20 artifact set");
  }
  const entries = new Map(receipt.artifacts.map((entry) => [entry.path, entry]));
  for (const path of registry.artifacts) {
    const entry = entries.get(path);
    if (
      entry === undefined
      || !/^[a-f0-9]{64}$/u.test(entry.sha256)
      || !Number.isInteger(entry.bytes)
      || entry.bytes <= 0
    ) {
      fail(`invalid artifact receipt: ${path}`);
    }
    await snapshotRegularFile(safePath(root, path), path).then((snapshot) => {
      if (snapshot.sha256.slice(7) !== entry.sha256 || snapshot.bytes !== entry.bytes) {
        fail(`evidence digest mismatch: ${path}`);
      }
    });
  }
  const workflow = await readBoundJson(root, entries.get("task-20/workflow-verdict.json"));
  if (
    workflow.gate !== "PASS"
    || workflow.schemaValid !== true
    || workflow.externalWriteInLocalMode !== false
  ) {
    fail("workflow verdict is not PASS with zero local writes");
  }
  const release = await readBoundJson(root, entries.get("task-20/release-verdict.json"));
  if (
    release.repositoryReady !== "PASS"
    || release.releaseReady !== "BLOCK"
    || release.externalWrites !== 0
    || !release.blockingGates?.includes("CLOUDFLARE_CREDENTIAL_PASS")
  ) {
    fail("release verdict is not honest PASS/BLOCK");
  }
  for (const [fixture, code] of unsafeCodes) {
    const path = `task-20/unsafe/${fixture}.json`;
    const verdict = await readBoundJson(root, entries.get(path));
    if (
      verdict.repositoryReady !== "FAIL"
      || verdict.externalWrites !== 0
      || !verdict.failingGates?.includes(code)
    ) {
      fail(`unsafe fixture did not fail closed: ${fixture}`);
    }
  }
  for (const signal of ["HUP", "INT", "TERM"]) {
    const path = `task-20/cleanup-${signal}.json`;
    const cleanup = await readBoundJson(root, entries.get(path));
    if (
      cleanup.signal !== signal
      || cleanup.tempRemoved !== true
      || cleanup.handlerTerminated !== true
      || cleanup.processGroupTerminated !== true
      || cleanup.waited !== true
    ) {
      fail(`signal cleanup receipt is unsafe: ${signal}`);
    }
  }
  await validateTodo20Provenance(receipt, root, entries);
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate: "PASS",
    sourceTree: receipt.tree,
    artifactCount: registry.artifacts.length,
    networkPolicy: receipt.network.policy,
    transcriptsValidated: true,
    externalWrites: 0,
  });
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => validate(parsed), parsed.output);
