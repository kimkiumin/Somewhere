import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  assertSameCleanSource,
  captureCleanSource,
} from "../../../../scripts/release/source-cleanliness.mjs";
import { validatePreparedEvidence } from "./prepared-evidence-validator.mjs";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const ACCESSIBILITY_PROJECTS = ["chromium-mobile", "webkit-mobile"];
const accessibilityReportSchema = z
  .object({
    keyboardFocus: z
      .object({
        focusVisible: z.literal(true),
        input: z.literal("Tab"),
        outlineStyle: z.literal("solid"),
        outlineWidthCssPx: z.number().min(3),
        screenshot: z.string(),
        targetRole: z.literal("button"),
      })
      .strict(),
    project: z.enum(["chromium-mobile", "webkit-mobile"]),
    reducedMotion: z
      .object({
        animationName: z.literal("none"),
        mediaQueryMatches: z.literal(true),
        requested: z.literal("reduce"),
        screenshot: z.string(),
      })
      .strict(),
    report: z.string(),
    schemaVersion: z.literal(1),
    textResize200: z
      .object({
        clippedTextCount: z.literal(0),
        cssViewport: z.object({ height: z.literal(780), width: z.literal(320) }).strict(),
        horizontalOverflow: z.literal(false),
        screenshot: z.string(),
        textScalePercent: z.literal(200),
      })
      .strict(),
  })
  .strict();
const accessibilitySchema = z
  .object({
    "chromium-mobile": accessibilityReportSchema,
    "webkit-mobile": accessibilityReportSchema,
  })
  .strict();
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
    if (result.has(key)) throw new TypeError(`duplicate validator argument: ${key}`);
    result.set(key, value);
  }
  return result;
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function accessibilityPaths() {
  return ACCESSIBILITY_PROJECTS.flatMap((project) => [
    `accessibility/${project}-keyboard-focus.png`,
    `accessibility/${project}-reduced-motion.png`,
    `accessibility/${project}-text-resize-200.png`,
    `accessibility/${project}.json`,
  ]).sort();
}

async function writeVerdict(output, value) {
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, output);
}

export async function validateManualPreparedEvidence(options) {
  const source = captureCleanSource(options.repo);
  try {
    const baseVerdict = await validatePreparedEvidence(options);
    const collection = JSON.parse(
      await readFile(path.join(options.input, "collection.json"), "utf8"),
    );
    let accessibility;
    try {
      accessibility = accessibilitySchema.parse(collection.observations?.accessibility);
    } catch {
      throw new TypeError("INCOMPLETE_ACCESSIBILITY_EVIDENCE");
    }
    const expectedPaths = accessibilityPaths();
    const observedPaths = collection.artifacts
      .map((item) => item.path)
      .filter((item) => item.startsWith("accessibility/"))
      .sort();
    if (
      observedPaths.length !== expectedPaths.length ||
      observedPaths.some((value, index) => value !== expectedPaths[index])
    ) {
      throw new TypeError("INCOMPLETE_ACCESSIBILITY_ARTIFACTS");
    }
    for (const project of ACCESSIBILITY_PROJECTS) {
      const expected = accessibility[project];
      if (
        expected.project !== project ||
        expected.report !== `accessibility/${project}.json` ||
        expected.keyboardFocus.screenshot !== `accessibility/${project}-keyboard-focus.png` ||
        expected.reducedMotion.screenshot !== `accessibility/${project}-reduced-motion.png` ||
        expected.textResize200.screenshot !== `accessibility/${project}-text-resize-200.png`
      ) {
        throw new TypeError("INCOMPLETE_ACCESSIBILITY_EVIDENCE");
      }
      const report = JSON.parse(await readFile(path.join(options.input, expected.report), "utf8"));
      if (JSON.stringify(report) !== JSON.stringify(expected)) {
        throw new TypeError("ACCESSIBILITY_REPORT_MISMATCH");
      }
    }
    const verdict = {
      ...baseVerdict,
      accessibilityProjects: ACCESSIBILITY_PROJECTS,
    };
    assertSameCleanSource(options.repo, source);
    await writeVerdict(options.output, verdict);
    assertSameCleanSource(options.repo, source);
    return verdict;
  } catch (error) {
    await rm(options.output, { force: true });
    await writeVerdict(options.output, {
      schemaVersion: 1,
      gate: "FAIL",
      reason: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
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
  const repo = path.resolve(options.get("--repo") ?? ".");
  if (options.has("--sha") && options.has("--input")) {
    const allowed = new Set(["--repo", "--sha", "--build-receipt", "--input", "--output"]);
    if ([...options.keys()].some((key) => !allowed.has(key))) {
      throw new TypeError("UNKNOWN_PREPARED_ARGUMENT");
    }
    const output = path.resolve(options.get("--output") ?? "");
    await validateManualPreparedEvidence({
      buildReceipt: path.resolve(options.get("--build-receipt") ?? ""),
      input: path.resolve(options.get("--input") ?? ""),
      output,
      repo,
      sha: options.get("--sha") ?? "",
    });
    process.stdout.write(`${output}\n`);
    return;
  }
  const manifestPath = path.resolve(options.get("--manifest") ?? "");
  const expectedSha = options.get("--expected-sha") ?? "";
  const expectedTree = options.get("--expected-tree") ?? "";
  const source = captureCleanSource(repo);
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (manifest.sourceSha !== expectedSha || source.sha !== expectedSha) {
    throw new TypeError("FOREIGN_SHA");
  }
  if (manifest.sourceTree !== expectedTree || source.tree !== expectedTree) {
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
  assertSameCleanSource(repo, source);
  process.stdout.write(
    `PASS sha=${manifest.sourceSha} tree=${manifest.sourceTree} build=${manifest.buildDigest} receipt=${manifest.buildReceiptDigest} artifacts=${manifest.artifacts.length}\n`,
  );
}

if (import.meta.main) await main();
