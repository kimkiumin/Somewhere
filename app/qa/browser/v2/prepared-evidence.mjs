import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertSameCleanSource,
  captureCleanSource,
} from "../../../../scripts/release/source-cleanliness.mjs";
import {
  APP_PREFIX,
  canonicalBuildDigest,
  sha256,
  validatePreparedReceipt,
} from "./prepared-build-receipt.mjs";

const SHA = /^[a-f0-9]{40}$/;
const PREPARED_STATES = [
  "real-handshake-ready",
  "real-ready-390x844",
  "real-following-390x844",
  "real-revealed-following-390x844",
  "real-stop-confirm-390x844",
  "real-route-failure-390x844",
  "real-stop-reason-390x844",
  "real-recovery-review-390x844",
  "real-arrived-390x844",
  "real-feedback-after-restart-390x844",
  "real-start-320x780",
  "real-start-390x844",
  "real-start-430x932",
  "real-start-1280x900",
  "real-offline-reload-390x844",
];

export const PREPARED_VISUAL_IDS = ["chromium-mobile", "webkit-mobile"].flatMap((project) =>
  PREPARED_STATES.map((state) => `${project}-${state}`),
);

async function files(directory, prefix = "") {
  const found = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await files(directory, relative)));
    else if (entry.isFile()) found.push(relative);
  }
  return found.sort();
}

function exactSet(actual, expected, reason) {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== [...expected].sort()[index])
  ) {
    throw new TypeError(reason);
  }
}

function validateOptions(options) {
  if (!SHA.test(options.sha)) throw new TypeError("FOREIGN_SHA");
  if (!SHA.test(options.sourceTree)) throw new TypeError("FOREIGN_TREE");
  if (options.viewports !== "320,390,430,wide") throw new TypeError("FOREIGN_VIEWPORTS");
  if (![options.buildReceipt, options.outputDir, options.output].every(path.isAbsolute)) {
    throw new TypeError("PREPARED_PATHS_MUST_BE_ABSOLUTE");
  }
  if (path.dirname(options.output) !== options.outputDir) throw new TypeError("FOREIGN_OUTPUT");
  const url = new URL(options.baseUrl);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError("INVALID_BASE_URL");
  }
  return url;
}

function curlAsset(url) {
  const result = spawnSync(
    "curl",
    ["--insecure", "--silent", "--show-error", "--fail", "--max-time", "10", url],
    { encoding: null, maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new TypeError(`FOREIGN_BASE_URL:${result.stderr}`);
  return result.stdout;
}

function runPlaywright(repo, outputDir, baseUrl) {
  return spawnSync(
    "bun",
    [
      "x",
      "playwright",
      "test",
      "--config",
      "playwright.v2.config.ts",
      "--project",
      "chromium-mobile",
      "--project",
      "webkit-mobile",
    ],
    {
      cwd: path.join(repo, "app"),
      encoding: "utf8",
      env: {
        ...process.env,
        SOMEWHERE_PREPARED_BASE_URL: baseUrl,
        V2_EVIDENCE_DIR: outputDir,
      },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
}

async function browserArtifact(outputDir, relative) {
  const bytes = await readFile(path.join(outputDir, relative));
  const item = { bytes: bytes.length, path: relative, sha256: sha256(bytes) };
  if (!relative.endsWith(".png")) return item;
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.length < 24) {
    throw new TypeError(`INVALID_PNG:${relative}`);
  }
  return { ...item, height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
}

async function emitCollection(output, collection, repo, source) {
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(collection, null, 2)}\n`);
  try {
    assertSameCleanSource(repo, source);
    await rename(temporary, output);
    assertSameCleanSource(repo, source);
  } catch (error) {
    await rm(temporary, { force: true });
    await rm(output, { force: true });
    throw error;
  }
}

export async function collectPreparedEvidence(options, dependencies = {}) {
  const url = validateOptions(options);
  const source = captureCleanSource(options.repo);
  if (source.sha !== options.sha) throw new TypeError("FOREIGN_SHA");
  if (source.tree !== options.sourceTree) throw new TypeError("FOREIGN_TREE");
  await rm(options.output, { force: true });
  const { appArtifacts, bytes: receiptBytes, receipt } = await validatePreparedReceipt(options);
  const fetchServed = dependencies.fetchServed ?? curlAsset;
  const servedArtifacts = [];
  for (const item of appArtifacts) {
    const relative = item.path.slice(APP_PREFIX.length);
    const assetUrl = new URL(relative === "index.html" ? "/" : `/${relative}`, url).href;
    const bytes = Buffer.from(await fetchServed(assetUrl));
    if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) {
      throw new TypeError("FOREIGN_BASE_URL");
    }
    servedArtifacts.push({
      bytes: item.bytes,
      path: item.path,
      sha256: item.sha256,
      url: assetUrl,
    });
  }
  await mkdir(options.outputDir, { recursive: true });
  await rm(path.join(options.outputDir, "visual"), { force: true, recursive: true });
  await rm(path.join(options.outputDir, "playwright-output"), { force: true, recursive: true });
  for (const name of ["browser-run.log", "playwright-results.json", "visual-metadata.json"]) {
    await rm(path.join(options.outputDir, name), { force: true });
  }
  const runBrowser = dependencies.runBrowser ?? runPlaywright;
  const run = await runBrowser(options.repo, options.outputDir, url.href);
  const browserLog = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  await writeFile(path.join(options.outputDir, "browser-run.log"), browserLog);
  if (run.status !== 0) throw new TypeError(`BROWSER_RUN_FAILED:${run.status}\n${browserLog}`);
  const results = JSON.parse(
    await readFile(path.join(options.outputDir, "playwright-results.json"), "utf8"),
  );
  if (results.stats?.expected !== 8 || results.stats?.unexpected !== 0) {
    throw new TypeError("INCOMPLETE_BROWSER_OBSERVATIONS");
  }
  const visualIds = (await files(path.join(options.outputDir, "visual")))
    .filter((item) => item.endsWith(".png"))
    .map((item) => item.slice(0, -4))
    .sort();
  exactSet(visualIds, PREPARED_VISUAL_IDS, "INCOMPLETE_VISUAL_SET");
  const tracePaths = (await files(path.join(options.outputDir, "playwright-output")))
    .filter((item) => item.endsWith("/trace.zip"))
    .map((item) => `playwright-output/${item}`);
  if (tracePaths.length !== 8) throw new TypeError("INCOMPLETE_TRACE_SET");
  const governed = [
    ...visualIds.map((item) => `visual/${item}.png`),
    ...tracePaths,
    "browser-run.log",
    "playwright-results.json",
    "visual-metadata.json",
  ].sort();
  const collection = {
    schemaVersion: 3,
    gate: "PASS",
    verdict: "PASS",
    sourceSha: source.sha,
    sourceTree: source.tree,
    baseUrl: url.origin,
    buildDigest: receipt.buildDigest,
    buildReceiptSha256: sha256(receiptBytes),
    servedArtifactDigest: canonicalBuildDigest(servedArtifacts),
    viewports: ["320", "390", "430", "wide"],
    expectedVisualIds: PREPARED_VISUAL_IDS,
    observations: {
      axeViolations: 0,
      command: "playwright test chromium-mobile webkit-mobile",
      consoleErrors: 0,
      expectedTests: 8,
      horizontalOverflow: 0,
      networkFailures: 0,
      offlineCoverage: {
        "chromium-mobile": "service-worker reload",
        "webkit-mobile": "offline precache inspection",
      },
      stateCoverage: PREPARED_VISUAL_IDS,
      unexpectedTests: 0,
    },
    artifacts: await Promise.all(governed.map((item) => browserArtifact(options.outputDir, item))),
    servedArtifacts,
    repoTrackedBefore: source,
    repoTrackedAfter: source,
    collectedAt: new Date().toISOString(),
    maxAgeMinutes: 30,
  };
  await (dependencies.beforeEmit?.() ?? Promise.resolve());
  assertSameCleanSource(options.repo, source);
  await emitCollection(options.output, collection, options.repo, source);
  return collection;
}
