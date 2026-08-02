import { resolve, sep } from "node:path";
import {
  collectBuildProvenance,
  validateBuildProvenance,
  workspaceManifestPaths,
} from "./build-provenance.mjs";
import {
  ReleaseInputError,
  assertHex,
  normalizeDigest,
  readJson,
  sha256,
  snapshotRegularFile,
} from "./release-core.mjs";
import { inspectSourceArchive } from "./source-archive.mjs";

function digestArtifacts(artifacts) {
  return sha256(artifacts.map((entry) => `${entry.sha256}\t${entry.bytes}\t${entry.path}\0`).join(""));
}

export async function readSourceArchiveFile(sourceArchive, path) {
  const snapshot = await snapshotRegularFile(resolve(sourceArchive), "prepared source archive");
  const observed = inspectSourceArchive(snapshot.data).files.get(path);
  if (observed === undefined) throw new ReleaseInputError(`prepared source archive is missing ${path}`);
  return observed;
}

export async function verifyPreparedBuild(options) {
  const sha = assertHex(options.sha, 40, "sha");
  const sourceTree = assertHex(options.sourceTree, 40, "source tree");
  const receiptSnapshot = await snapshotRegularFile(
    resolve(options.receipt),
    "prepared build receipt",
  );
  const archiveSnapshot = await snapshotRegularFile(
    resolve(options.sourceArchive),
    "prepared source archive",
  );
  const sourceArchive = inspectSourceArchive(archiveSnapshot.data);
  const receipt = JSON.parse(receiptSnapshot.data.toString());
  if (
    receipt?.schemaVersion !== 2
    || receipt.finalSha !== sha
    || receipt.sourceTree !== sourceTree
    || !Array.isArray(receipt.artifacts)
    || receipt.artifacts.length === 0
  ) {
    throw new ReleaseInputError("prepared build receipt identity or artifacts invalid");
  }
  if (sourceArchive.sourceTree !== sourceTree) {
    throw new ReleaseInputError("prepared source archive source tree mismatch");
  }
  validateBuildProvenance(receipt.provenance);
  const installed = await collectBuildProvenance(resolve(options.repo));
  if (
    receipt.provenance.bun.version !== installed.bun.version
    || JSON.stringify(receipt.provenance.tools) !== JSON.stringify(installed.tools)
  ) {
    throw new ReleaseInputError("prepared build provenance does not match installed toolchain");
  }
  const sourceInputs = [
    receipt.provenance.lockfile,
    ...receipt.provenance.workspaceManifests,
  ];
  if (
    sourceInputs[0].path !== "bun.lock"
    || JSON.stringify(sourceInputs.slice(1).map((entry) => entry.path))
      !== JSON.stringify(workspaceManifestPaths)
  ) {
    throw new ReleaseInputError("prepared build provenance source inputs invalid");
  }
  for (const input of sourceInputs) {
    const bytes = sourceArchive.files.get(input.path);
    if (bytes === undefined) {
      throw new ReleaseInputError(`prepared source archive is missing ${input.path}`);
    }
    const observed = sha256(bytes);
    if (observed !== normalizeDigest(input.sha256)) {
      throw new ReleaseInputError(`prepared build provenance mismatch: ${input.path}`);
    }
  }
  const buildRoot = resolve(options.buildRoot);
  const observedArtifacts = [];
  const seen = new Set();
  for (const artifact of receipt.artifacts) {
    const prefix = "prepared/build/";
    if (
      typeof artifact?.path !== "string"
      || !artifact.path.startsWith(prefix)
      || seen.has(artifact.path)
    ) {
      throw new ReleaseInputError("unsafe or duplicate prepared build artifact");
    }
    const relativePath = artifact.path.slice(prefix.length);
    const absolute = resolve(buildRoot, relativePath);
    if (!absolute.startsWith(`${buildRoot}${sep}`)) {
      throw new ReleaseInputError("unsafe prepared build artifact");
    }
    const snapshot = await snapshotRegularFile(absolute, `prepared build artifact ${artifact.path}`);
    if (
      snapshot.sha256 !== normalizeDigest(artifact.sha256)
      || snapshot.bytes !== artifact.bytes
    ) {
      throw new ReleaseInputError(`prepared build artifact mismatch: ${artifact.path}`);
    }
    seen.add(artifact.path);
    observedArtifacts.push({
      ...artifact,
      sha256: snapshot.sha256,
      bytes: snapshot.bytes,
    });
  }
  if (receipt.buildDigest !== digestArtifacts(observedArtifacts)) {
    throw new ReleaseInputError("prepared build digest mismatch");
  }
  return {
    receipt,
    receiptSha256: receiptSnapshot.sha256,
    sourceArchiveSha256: archiveSnapshot.sha256,
    artifactCount: observedArtifacts.length,
  };
}
