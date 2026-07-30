import { resolve } from "node:path";
import { mainBoundary, parseArguments, writeJson } from "./lib/release-core.mjs";
import { verifyPreparedBuild } from "./lib/prepared-build.mjs";

const specification = {
  required: [
    "--sha",
    "--source-tree",
    "--build-root",
    "--build-receipt",
    "--source-archive",
    "--output",
  ],
};

async function execute(options) {
  const verified = await verifyPreparedBuild({
    sha: options.sha,
    sourceTree: options["source-tree"],
    repo: resolve("."),
    buildRoot: options["build-root"],
    receipt: options["build-receipt"],
    sourceArchive: options["source-archive"],
  });
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    artifactRole: "prepared-release-candidate-reference",
    sourceSha: options.sha,
    sourceTree: options["source-tree"],
    preparedBuild: {
      receiptSha256: verified.receiptSha256,
      buildDigest: verified.receipt.buildDigest,
      artifactCount: verified.artifactCount,
    },
    sourceArchive: { sha256: verified.sourceArchiveSha256 },
  });
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => execute(parsed), parsed.output);
