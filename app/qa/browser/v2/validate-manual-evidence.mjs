import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const artifactSchema = z
  .object({
    path: z
      .string()
      .regex(
        /^(visual\/[A-Za-z0-9._-]+\.png|playwright-output\/[A-Za-z0-9._/-]+\/trace\.zip|browser-run\.log|build-receipt\.json|playwright-results\.json|process-(start|cleanup)\.json|visual-metadata\.json)$/,
      ),
    sha256: digest,
    bytes: z.number().int().positive(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .strict();
const cleanupSchema = z
  .object({
    exitCode: z.number().int(),
    pid: z.number().int().positive(),
    port: z.literal(8787),
    portClosed: z.literal(true),
    stateRemoved: z.literal(true),
  })
  .strict();
const manifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
    sourceTree: z.string().regex(/^[a-f0-9]{40}$/),
    buildDigest: digest,
    buildReceiptDigest: digest,
    collectedAt: z.iso.datetime(),
    maxAgeMinutes: z.number().int().min(1).max(1440),
    observations: z
      .object({
        command: z.literal("bun run test:e2e:v2"),
        exitCode: z.literal(0),
        expectedTests: z.literal(5),
        unexpectedTests: z.literal(0),
        surfaces: z.array(z.string()).min(4),
        cleanup: cleanupSchema,
      })
      .strict(),
    artifacts: z.array(artifactSchema).min(27),
    verdict: z.literal("PASS"),
  })
  .strict();
const buildReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
    sourceTree: z.string().regex(/^[a-f0-9]{40}$/),
    buildDigest: digest,
    builtAt: z.iso.datetime(),
    command: z.literal("bun run local:v2:prepare"),
  })
  .strict();

function argumentsMap(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new TypeError("validator arguments must be --name value pairs");
    }
    result.set(key, value);
  }
  return result;
}

function git(repo, values) {
  const result = spawnSync("git", ["-C", repo, ...values], { encoding: "utf8" });
  if (result.status !== 0) throw new TypeError(result.stderr.trim());
  return result.stdout.trim();
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function files(directory, prefix = "") {
  const found = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await files(directory, relative)));
    else if (entry.isFile()) found.push(relative);
  }
  return found.sort();
}

async function buildDigest(repo) {
  const dist = path.join(repo, "app", "dist");
  const hash = createHash("sha256");
  for (const relative of await files(dist)) {
    hash.update(relative);
    hash.update("\0");
    hash.update(await readFile(path.join(dist, relative)));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

async function main() {
  const options = argumentsMap(process.argv.slice(2));
  const manifestPath = path.resolve(options.get("--manifest") ?? "");
  const expectedSha = options.get("--expected-sha") ?? "";
  const expectedTree = options.get("--expected-tree") ?? "";
  const repo = path.resolve(options.get("--repo") ?? ".");
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (manifest.sourceSha !== expectedSha || git(repo, ["rev-parse", "HEAD"]) !== expectedSha) {
    throw new TypeError("FOREIGN_SHA");
  }
  if (manifest.sourceTree !== expectedTree || git(repo, ["write-tree"]) !== expectedTree) {
    throw new TypeError("FOREIGN_TREE");
  }
  const ageMs = Date.now() - Date.parse(manifest.collectedAt);
  if (ageMs < 0 || ageMs > manifest.maxAgeMinutes * 60_000) throw new TypeError("STALE_EVIDENCE");
  if (manifest.buildDigest !== (await buildDigest(repo))) throw new TypeError("FOREIGN_BUILD");

  const evidence = path.dirname(manifestPath);
  const receiptBytes = await readFile(path.join(evidence, "build-receipt.json"));
  if (manifest.buildReceiptDigest !== sha256(receiptBytes)) {
    throw new TypeError("FOREIGN_BUILD_RECEIPT");
  }
  const receipt = buildReceiptSchema.parse(JSON.parse(receiptBytes.toString("utf8")));
  if (
    receipt.sourceSha !== expectedSha ||
    receipt.sourceTree !== expectedTree ||
    receipt.buildDigest !== manifest.buildDigest
  ) {
    throw new TypeError("FOREIGN_BUILD_RECEIPT");
  }
  const seen = new Set();
  for (const artifact of manifest.artifacts) {
    if (seen.has(artifact.path)) throw new TypeError(`DUPLICATE_ARTIFACT:${artifact.path}`);
    seen.add(artifact.path);
    const bytes = await readFile(path.join(evidence, artifact.path));
    if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) {
      throw new TypeError(`ARTIFACT_MISMATCH:${artifact.path}`);
    }
    if (artifact.path.endsWith(".png")) {
      if (
        artifact.width === undefined ||
        artifact.height === undefined ||
        bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        bytes.readUInt32BE(16) !== artifact.width ||
        bytes.readUInt32BE(20) !== artifact.height
      ) {
        throw new TypeError(`ARTIFACT_MISMATCH:${artifact.path}`);
      }
    } else if (artifact.width !== undefined || artifact.height !== undefined) {
      throw new TypeError(`ARTIFACT_MISMATCH:${artifact.path}`);
    }
  }
  const required = [
    "browser-run.log",
    "build-receipt.json",
    "playwright-results.json",
    "process-cleanup.json",
    "process-start.json",
    "visual-metadata.json",
  ];
  if (
    required.some((value) => !seen.has(value)) ||
    [...seen].filter((v) => v.endsWith(".png")).length !== 16 ||
    [...seen].filter((v) => v.endsWith("/trace.zip")).length !== 5
  ) {
    throw new TypeError("INCOMPLETE_ARTIFACT_SET");
  }
  process.stdout.write(
    `PASS sha=${manifest.sourceSha} tree=${manifest.sourceTree} build=${manifest.buildDigest} receipt=${manifest.buildReceiptDigest} artifacts=${manifest.artifacts.length}\n`,
  );
}

await main();
