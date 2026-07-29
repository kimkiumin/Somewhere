import { resolve, sep } from "node:path";
import {
  assertRegularFile,
  digestFile,
  mainBoundary,
  normalizeDigest,
  parseArguments,
  readJson,
  sha256,
  writeJson,
} from "./lib/release-core.mjs";

const specification = {
  required: ["--sha", "--source-tree", "--receipt", "--final-root", "--output"],
};

function digestArtifacts(artifacts) {
  return sha256(artifacts.map((entry) => `${entry.sha256}\t${entry.bytes}\t${entry.path}\0`).join(""));
}

async function verify(options) {
  const finalRoot = resolve(options["final-root"]);
  const receiptPath = resolve(options.receipt);
  const receipt = await readJson(receiptPath);
  if (
    receipt.schemaVersion !== 2
    || receipt.finalSha !== options.sha
    || receipt.sourceTree !== options["source-tree"]
    || !Array.isArray(receipt.artifacts)
    || receipt.artifacts.length === 0
  ) {
    throw new TypeError("build receipt identity or artifacts invalid");
  }
  const observed = [];
  const seen = new Set();
  for (const artifact of receipt.artifacts) {
    const absolute = resolve(finalRoot, artifact.path);
    if (!absolute.startsWith(`${finalRoot}${sep}`) || seen.has(artifact.path)) {
      throw new TypeError("unsafe or duplicate build artifact");
    }
    await assertRegularFile(absolute, `build artifact ${artifact.path}`);
    seen.add(artifact.path);
    const sha256Value = await digestFile(absolute);
    const bytes = (await Bun.file(absolute).arrayBuffer()).byteLength;
    if (sha256Value !== normalizeDigest(artifact.sha256) || bytes !== artifact.bytes) {
      throw new TypeError(`build artifact mismatch: ${artifact.path}`);
    }
    observed.push({ ...artifact, sha256: sha256Value, bytes });
  }
  if (receipt.buildDigest !== digestArtifacts(observed)) throw new TypeError("build digest mismatch");
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate: "PASS",
    finalSha: receipt.finalSha,
    sourceTree: receipt.sourceTree,
    receiptSha256: await digestFile(receiptPath),
    buildDigest: receipt.buildDigest,
    artifactCount: observed.length,
  });
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => verify(parsed), parsed.output);
