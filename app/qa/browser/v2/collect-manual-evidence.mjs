import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertSameCleanSource,
  captureCleanSource,
} from "../../../../scripts/release/source-cleanliness.mjs";
import { collectPreparedEvidence } from "./prepared-evidence.mjs";

const ACCESSIBILITY_PROJECTS = ["chromium-mobile", "webkit-mobile"];

function argumentsMap(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new TypeError("collector arguments must be --name value pairs");
    }
    if (result.has(key)) throw new TypeError(`duplicate collector argument: ${key}`);
    result.set(key, value);
  }
  return result;
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

async function artifact(evidence, relative) {
  const bytes = await readFile(path.join(evidence, relative));
  const value = { path: relative, sha256: sha256(bytes), bytes: bytes.length };
  if (relative.endsWith(".png")) {
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.length < 24) {
      throw new TypeError(`invalid PNG: ${relative}`);
    }
    return { ...value, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  return value;
}

function accessibilityPaths() {
  return ACCESSIBILITY_PROJECTS.flatMap((project) => [
    `accessibility/${project}-keyboard-focus.png`,
    `accessibility/${project}-reduced-motion.png`,
    `accessibility/${project}-text-resize-200.png`,
    `accessibility/${project}.json`,
  ]).sort();
}

export async function collectManualPreparedEvidence(options, dependencies = {}) {
  const source = captureCleanSource(options.repo);
  await rm(path.join(options.outputDir, "accessibility"), { force: true, recursive: true });
  const collection = await collectPreparedEvidence(options, dependencies);
  try {
    const expectedPaths = accessibilityPaths();
    const observedPaths = await files(options.outputDir, "accessibility");
    if (
      observedPaths.length !== expectedPaths.length ||
      observedPaths.some((value, index) => value !== expectedPaths[index])
    ) {
      throw new TypeError("INCOMPLETE_ACCESSIBILITY_ARTIFACTS");
    }
    const accessibility = Object.fromEntries(
      await Promise.all(
        ACCESSIBILITY_PROJECTS.map(async (project) => {
          const report = JSON.parse(
            await readFile(path.join(options.outputDir, `accessibility/${project}.json`), "utf8"),
          );
          if (report.project !== project) throw new TypeError("INCOMPLETE_ACCESSIBILITY_EVIDENCE");
          return [project, report];
        }),
      ),
    );
    const artifacts = [
      ...collection.artifacts,
      ...(await Promise.all(
        expectedPaths.map((relative) => artifact(options.outputDir, relative)),
      )),
    ];
    const augmented = {
      ...collection,
      observations: { ...collection.observations, accessibility },
      artifacts,
      reviewBindings: artifacts
        .filter((entry) => /\.(?:json|log|png)$/u.test(entry.path))
        .map((entry) => ({
          path: path.resolve(options.outputDir, entry.path),
          sha256: entry.sha256,
        })),
    };
    const temporary = `${options.output}.tmp-accessibility-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(augmented, null, 2)}\n`);
    assertSameCleanSource(options.repo, source);
    await rename(temporary, options.output);
    assertSameCleanSource(options.repo, source);
    return augmented;
  } catch (error) {
    await rm(`${options.output}.tmp-accessibility-${process.pid}`, { force: true });
    await rm(options.output, { force: true });
    throw error;
  }
}

async function main() {
  const options = argumentsMap(process.argv.slice(2));
  const repo = path.resolve(options.get("--repo") ?? ".");
  if (options.has("--sha")) {
    const allowed = new Set([
      "--repo",
      "--sha",
      "--source-tree",
      "--base-url",
      "--build-receipt",
      "--viewports",
      "--output-dir",
      "--output",
    ]);
    if ([...options.keys()].some((key) => !allowed.has(key))) {
      throw new TypeError("UNKNOWN_PREPARED_ARGUMENT");
    }
    const output = path.resolve(options.get("--output") ?? "");
    await collectManualPreparedEvidence({
      baseUrl: options.get("--base-url") ?? "",
      buildReceipt: path.resolve(options.get("--build-receipt") ?? ""),
      output,
      outputDir: path.resolve(options.get("--output-dir") ?? ""),
      repo,
      sha: options.get("--sha") ?? "",
      sourceTree: options.get("--source-tree") ?? "",
      viewports: options.get("--viewports") ?? "",
    });
    process.stdout.write(`${output}\n`);
    return;
  }
  const evidence = path.resolve(options.get("--evidence") ?? "");
  const expectedSha = options.get("--expected-sha") ?? "";
  const source = captureCleanSource(repo);
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || source.sha !== expectedSha) {
    throw new TypeError("FOREIGN_SHA");
  }
  await mkdir(evidence, { recursive: true });
  await rm(path.join(evidence, "visual"), { force: true, recursive: true });
  for (const name of [
    "browser-run.log",
    "build-receipt.json",
    "playwright-results.json",
    "process-cleanup.json",
    "process-start.json",
    "visual-metadata.json",
    "manual-evidence.json",
  ]) {
    await rm(path.join(evidence, name), { force: true });
  }
  const run = spawnSync("bun", ["run", "test:e2e:v2"], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, V2_EVIDENCE_DIR: evidence },
    maxBuffer: 16 * 1024 * 1024,
  });
  const browserLog = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  await writeFile(path.join(evidence, "browser-run.log"), browserLog);
  if (run.status !== 0) throw new TypeError(`BROWSER_RUN_FAILED:${run.status}\n${browserLog}`);

  const sourceTree = source.tree;
  const buildReceiptBytes = await readFile(path.join(evidence, "build-receipt.json"));
  const buildReceipt = JSON.parse(buildReceiptBytes.toString("utf8"));
  const digest = await buildDigest(repo);
  if (
    buildReceipt.sourceSha !== expectedSha ||
    buildReceipt.sourceTree !== sourceTree ||
    buildReceipt.buildDigest !== digest
  ) {
    throw new TypeError("FOREIGN_BUILD_RECEIPT");
  }
  const cleanup = JSON.parse(await readFile(path.join(evidence, "process-cleanup.json"), "utf8"));
  if (cleanup.portClosed !== true || cleanup.stateRemoved !== true) {
    throw new TypeError("INCOMPLETE_CLEANUP");
  }
  const playwright = JSON.parse(
    await readFile(path.join(evidence, "playwright-results.json"), "utf8"),
  );
  const testCounts = playwright.stats;
  if (testCounts?.unexpected !== 0 || testCounts?.expected !== 5) {
    throw new TypeError("INCOMPLETE_BROWSER_OBSERVATIONS");
  }
  const visualPaths = (await files(path.join(evidence, "visual")))
    .filter((value) => value.endsWith(".png"))
    .map((value) => `visual/${value}`);
  if (visualPaths.length !== 16) throw new TypeError(`EXPECTED_16_VISUALS:${visualPaths.length}`);
  const tracePaths = (await files(path.join(evidence, "playwright-output")))
    .filter((value) => value.endsWith("/trace.zip"))
    .map((value) => `playwright-output/${value}`);
  if (tracePaths.length !== 5) throw new TypeError(`EXPECTED_5_TRACES:${tracePaths.length}`);
  const governedPaths = [
    ...visualPaths,
    ...tracePaths,
    "browser-run.log",
    "build-receipt.json",
    "playwright-results.json",
    "process-cleanup.json",
    "process-start.json",
    "visual-metadata.json",
  ];
  const manifest = {
    schemaVersion: 2,
    sourceSha: expectedSha,
    sourceTree,
    buildDigest: digest,
    buildReceiptDigest: sha256(buildReceiptBytes),
    collectedAt: new Date().toISOString(),
    maxAgeMinutes: 30,
    observations: {
      command: "bun run test:e2e:v2",
      exitCode: run.status,
      expectedTests: testCounts.expected,
      unexpectedTests: testCounts.unexpected,
      surfaces: [
        "real Worker network and console",
        "WCAG 2A/AA/2.1AA axe scan",
        "320/390/430/1280 horizontal overflow",
        "offline service-worker reload",
      ],
      cleanup,
    },
    artifacts: await Promise.all(governedPaths.map((relative) => artifact(evidence, relative))),
    verdict: "PASS",
  };
  const output = path.join(evidence, "manual-evidence.json");
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  try {
    assertSameCleanSource(repo, source);
    await rename(temporary, output);
    assertSameCleanSource(repo, source);
  } catch (error) {
    await rm(temporary, { force: true });
    await rm(output, { force: true });
    throw error;
  }
  process.stdout.write(`${output}\n`);
}

if (import.meta.main) await main();
