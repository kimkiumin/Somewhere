import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  digestFile,
  mainBoundary,
  normalizeDigest,
  parseArguments,
  readJson,
  writeJson,
} from "./lib/release-core.mjs";
import { validateFinalVerdict } from "./lib/release-contracts.mjs";

const specification = {
  required: [
    "--verdict",
    "--verdict-sha256",
    "--manifest",
    "--manifest-sha256",
    "--sha",
    "--source-tree",
    "--tag-message",
    "--output",
  ],
};

async function verify(options) {
  const verdictPath = resolve(options.verdict);
  const manifestPath = resolve(options.manifest);
  const verdictDigest = normalizeDigest(options["verdict-sha256"], "verdict-sha256");
  const manifestDigest = normalizeDigest(options["manifest-sha256"], "manifest-sha256");
  if (await digestFile(verdictPath) !== verdictDigest) {
    throw new TypeError("STAGING_REPOSITORY_VERDICT_DIGEST_MISMATCH");
  }
  if (await digestFile(manifestPath) !== manifestDigest) {
    throw new TypeError("STAGING_TERMINAL_MANIFEST_DIGEST_MISMATCH");
  }

  const verdict = validateFinalVerdict(await readJson(verdictPath));
  if (
    verdict.finalSha !== options.sha
    || verdict.sourceTree !== options["source-tree"]
    || verdict.repositoryReady !== "PASS"
    || verdict.releaseReady !== "BLOCK"
  ) {
    throw new TypeError("STAGING_REPOSITORY_SEAL_NOT_ELIGIBLE");
  }

  const manifestLines = (await readFile(manifestPath, "utf8")).trimEnd().split("\n");
  if (
    manifestLines.length === 0
    || new Set(manifestLines).size !== manifestLines.length
    || manifestLines.some((line) => !/^[a-f0-9]{64}  [^\r\n]+$/u.test(line))
    || !manifestLines.includes(`${verdictDigest.slice(7)}  final-verdict.json`)
  ) {
    throw new TypeError("STAGING_TERMINAL_MANIFEST_INVALID");
  }

  const tagLines = new Set((await readFile(resolve(options["tag-message"]), "utf8")).split(/\r?\n/u));
  const requiredTagLines = [
    `Somewhere-Repository-Verdict-SHA256: ${verdictDigest.slice(7)}`,
    `Somewhere-Terminal-Manifest-SHA256: ${manifestDigest.slice(7)}`,
  ];
  if (requiredTagLines.some((line) => !tagLines.has(line))) {
    throw new TypeError("STAGING_TAG_SEAL_BINDING_MISSING");
  }

  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate: "PASS",
    finalSha: verdict.finalSha,
    sourceTree: verdict.sourceTree,
    repositoryVerdictSha256: verdictDigest,
    terminalManifestSha256: manifestDigest,
  });
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => verify(parsed), parsed.output);
