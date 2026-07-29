import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertSameCleanSource,
  captureCleanSource,
} from "../../../../scripts/release/source-cleanliness.mjs";
import {
  canonicalBuildDigest,
  sha256,
  validatePreparedReceipt,
} from "./prepared-build-receipt.mjs";
import { PREPARED_VISUAL_IDS } from "./prepared-evidence.mjs";

const SHA = /^[a-f0-9]{40}$/;

function exactSet(actual, expected, reason) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
    throw new TypeError(reason);
  }
}

function relativeArtifact(input, value) {
  const absolute = path.resolve(input, value);
  if (path.isAbsolute(value) || !absolute.startsWith(`${input}${path.sep}`)) {
    throw new TypeError("ARTIFACT_MISMATCH");
  }
  return absolute;
}

async function writeVerdict(output, value) {
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, output);
}

async function validate(options) {
  if (!SHA.test(options.sha)) throw new TypeError("FOREIGN_SHA");
  if (![options.buildReceipt, options.input, options.output].every(path.isAbsolute)) {
    throw new TypeError("PREPARED_PATHS_MUST_BE_ABSOLUTE");
  }
  const source = captureCleanSource(options.repo);
  if (source.sha !== options.sha) throw new TypeError("FOREIGN_SHA");
  const {
    appArtifacts,
    bytes: receiptBytes,
    receipt,
  } = await validatePreparedReceipt({
    buildReceipt: options.buildReceipt,
    sha: options.sha,
    sourceTree: source.tree,
  });
  const collectionPath = path.join(options.input, "collection.json");
  const collection = JSON.parse(await readFile(collectionPath, "utf8"));
  if (
    collection.schemaVersion !== 3 ||
    collection.gate !== "PASS" ||
    collection.verdict !== "PASS" ||
    collection.sourceSha !== source.sha ||
    collection.sourceTree !== source.tree ||
    collection.buildDigest !== receipt.buildDigest ||
    collection.buildReceiptSha256 !== sha256(receiptBytes) ||
    collection.maxAgeMinutes !== 30 ||
    collection.repoTrackedBefore?.sha !== source.sha ||
    collection.repoTrackedBefore?.tree !== source.tree ||
    collection.repoTrackedAfter?.sha !== source.sha ||
    collection.repoTrackedAfter?.tree !== source.tree
  ) {
    throw new TypeError("FOREIGN_COLLECTION");
  }
  const age = Date.now() - Date.parse(collection.collectedAt);
  if (!Number.isFinite(age) || age < 0 || age > collection.maxAgeMinutes * 60_000) {
    throw new TypeError("STALE_EVIDENCE");
  }
  exactSet(collection.viewports ?? [], ["320", "390", "430", "wide"], "INCOMPLETE_VIEWPORTS");
  exactSet(collection.expectedVisualIds ?? [], PREPARED_VISUAL_IDS, "INCOMPLETE_VISUAL_SET");
  exactSet(
    collection.observations?.stateCoverage ?? [],
    PREPARED_VISUAL_IDS,
    "INCOMPLETE_STATE_COVERAGE",
  );
  if (
    collection.observations?.expectedTests !== 8 ||
    collection.observations?.unexpectedTests !== 0 ||
    collection.observations?.consoleErrors !== 0 ||
    collection.observations?.networkFailures !== 0 ||
    collection.observations?.horizontalOverflow !== 0 ||
    collection.observations?.axeViolations !== 0 ||
    collection.observations?.offlineCoverage?.["chromium-mobile"] !== "service-worker reload" ||
    collection.observations?.offlineCoverage?.["webkit-mobile"] !== "offline precache inspection"
  ) {
    throw new TypeError("FAILED_BROWSER_OBSERVATIONS");
  }
  if (!Array.isArray(collection.artifacts)) throw new TypeError("INCOMPLETE_ARTIFACT_SET");
  const artifactPaths = [];
  for (const artifact of collection.artifacts) {
    if (
      typeof artifact.path !== "string" ||
      typeof artifact.sha256 !== "string" ||
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes <= 0
    ) {
      throw new TypeError("ARTIFACT_MISMATCH");
    }
    const bytes = await readFile(relativeArtifact(options.input, artifact.path));
    if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) {
      throw new TypeError(`ARTIFACT_MISMATCH:${artifact.path}`);
    }
    if (
      artifact.path.endsWith(".png") &&
      (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        bytes.readUInt32BE(16) !== artifact.width ||
        bytes.readUInt32BE(20) !== artifact.height)
    ) {
      throw new TypeError(`ARTIFACT_MISMATCH:${artifact.path}`);
    }
    artifactPaths.push(artifact.path);
  }
  if (new Set(artifactPaths).size !== artifactPaths.length) {
    throw new TypeError("DUPLICATE_ARTIFACT");
  }
  const requiredVisuals = PREPARED_VISUAL_IDS.map((id) => `visual/${id}.png`);
  exactSet(
    artifactPaths.filter((item) => item.startsWith("visual/")),
    requiredVisuals,
    "INCOMPLETE_VISUAL_SET",
  );
  if (
    artifactPaths.filter((item) => item.endsWith("/trace.zip")).length !== 8 ||
    !["browser-run.log", "playwright-results.json", "visual-metadata.json"].every((item) =>
      artifactPaths.includes(item),
    )
  ) {
    throw new TypeError("INCOMPLETE_ARTIFACT_SET");
  }
  if (!Array.isArray(collection.servedArtifacts)) throw new TypeError("FOREIGN_SERVED_SET");
  exactSet(
    collection.servedArtifacts.map((item) => item.path),
    appArtifacts.map((item) => item.path),
    "FOREIGN_SERVED_SET",
  );
  for (const served of collection.servedArtifacts) {
    const receiptArtifact = appArtifacts.find((item) => item.path === served.path);
    if (
      receiptArtifact === undefined ||
      served.sha256 !== receiptArtifact.sha256 ||
      served.bytes !== receiptArtifact.bytes ||
      typeof served.url !== "string" ||
      new URL(served.url).origin !== collection.baseUrl
    ) {
      throw new TypeError("FOREIGN_SERVED_SET");
    }
  }
  if (collection.servedArtifactDigest !== canonicalBuildDigest(collection.servedArtifacts)) {
    throw new TypeError("FOREIGN_SERVED_SET");
  }
  assertSameCleanSource(options.repo, source);
  return {
    schemaVersion: 1,
    gate: "PASS",
    sourceSha: source.sha,
    sourceTree: source.tree,
    buildReceiptSha256: sha256(receiptBytes),
    artifactCount: collection.artifacts.length,
    servedArtifactCount: collection.servedArtifacts.length,
  };
}

export async function validatePreparedEvidence(options) {
  await rm(options.output, { force: true });
  try {
    const verdict = await validate(options);
    const source = { sha: verdict.sourceSha, tree: verdict.sourceTree };
    assertSameCleanSource(options.repo, source);
    await writeVerdict(options.output, verdict);
    assertSameCleanSource(options.repo, source);
    return verdict;
  } catch (error) {
    await rm(options.output, { force: true });
    const reason = error instanceof Error ? error.message : String(error);
    await writeVerdict(options.output, { schemaVersion: 1, gate: "FAIL", reason });
    throw error;
  }
}
