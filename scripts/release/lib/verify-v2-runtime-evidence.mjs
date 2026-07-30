import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  ReleaseInputError,
  assertHex,
  normalizeDigest,
  sha256,
  snapshotRegularFile,
} from "./release-core.mjs";

function parseJson(snapshot, label) {
  try {
    return JSON.parse(snapshot.data.toString());
  } catch (error) {
    if (error instanceof SyntaxError) throw new ReleaseInputError(`invalid ${label} JSON`);
    throw error;
  }
}

async function loadRegistry(path) {
  const snapshot = await snapshotRegularFile(resolve(path), "verify-v2 runtime artifact registry");
  const value = parseJson(snapshot, "verify-v2 runtime artifact registry");
  if (value?.schemaVersion !== 1 || !Array.isArray(value.artifacts) || value.artifacts.length === 0) {
    throw new ReleaseInputError("invalid verify-v2 runtime artifact registry");
  }
  const names = new Set();
  const artifacts = value.artifacts.map((entry) => {
    if (
      typeof entry?.path !== "string"
      || entry.path === ""
      || basename(entry.path) !== entry.path
      || typeof entry.kind !== "string"
      || entry.kind === ""
      || names.has(entry.path)
    ) {
      throw new ReleaseInputError("invalid or duplicate verify-v2 runtime artifact");
    }
    names.add(entry.path);
    return { path: entry.path, kind: entry.kind };
  });
  const sorted = [...names].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  if (JSON.stringify([...names]) !== JSON.stringify(sorted)) {
    throw new ReleaseInputError("verify-v2 runtime artifact registry must be byte-sorted");
  }
  return { path: snapshot.path, sha256: snapshot.sha256, artifacts };
}

async function canonicalDirectory(path) {
  const absolute = resolve(path);
  const initial = await lstat(absolute, { bigint: true });
  if (!initial.isDirectory() || initial.isSymbolicLink()) {
    throw new ReleaseInputError("verify-v2 runtime evidence root must be a regular directory");
  }
  const canonical = await realpath(absolute);
  if (canonical !== absolute) {
    throw new ReleaseInputError("verify-v2 runtime evidence root must not traverse symlinks");
  }
  const final = await lstat(absolute, { bigint: true });
  if (initial.dev !== final.dev || initial.ino !== final.ino || !final.isDirectory()) {
    throw new ReleaseInputError("verify-v2 runtime evidence root changed while opening");
  }
  return { path: canonical, dev: initial.dev, ino: initial.ino };
}

async function assertDirectoryIdentity(directory) {
  const current = await lstat(directory.path, { bigint: true });
  if (
    !current.isDirectory()
    || current.isSymbolicLink()
    || current.dev !== directory.dev
    || current.ino !== directory.ino
    || await realpath(directory.path) !== directory.path
  ) {
    throw new ReleaseInputError("verify-v2 runtime evidence root changed while reading");
  }
}

async function assertArtifactSnapshots(directory, artifacts) {
  await assertDirectoryIdentity(directory);
  for (const artifact of artifacts) {
    const current = await snapshotRegularFile(
      resolve(directory.path, artifact.path),
      `verify-v2 runtime artifact ${artifact.path}`,
    );
    if (current.sha256 !== artifact.sha256 || current.bytes !== artifact.bytes) {
      throw new ReleaseInputError(
        `verify-v2 runtime artifact changed after snapshot: ${artifact.path}`,
      );
    }
  }
  await assertDirectoryIdentity(directory);
}

async function snapshotArtifacts(root, registry, afterSnapshot) {
  const directory = await canonicalDirectory(root);
  const entries = await readdir(directory.path, { withFileTypes: true });
  const names = entries
    .map((entry) => entry.name)
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const expected = registry.artifacts.map((entry) => entry.path);
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new ReleaseInputError("verify-v2 runtime artifact set mismatch");
  }
  const artifacts = [];
  for (const expectedArtifact of registry.artifacts) {
    const entry = entries.find((candidate) => candidate.name === expectedArtifact.path);
    if (entry === undefined || !entry.isFile() || entry.isSymbolicLink()) {
      throw new ReleaseInputError(`${expectedArtifact.path} must be a regular file`);
    }
    const snapshot = await snapshotRegularFile(
      resolve(directory.path, expectedArtifact.path),
      `verify-v2 runtime artifact ${expectedArtifact.path}`,
    );
    artifacts.push({
      path: expectedArtifact.path,
      kind: expectedArtifact.kind,
      sha256: snapshot.sha256,
      bytes: snapshot.bytes,
      absolutePath: snapshot.path,
      data: snapshot.data,
    });
  }
  if (afterSnapshot !== undefined) await afterSnapshot();
  await assertArtifactSnapshots(directory, artifacts);
  return { directory: directory.path, artifacts };
}

function manifestArtifacts(artifacts) {
  return artifacts.map(({ path, kind, sha256: digest, bytes }) => ({
    path,
    kind,
    sha256: digest,
    bytes,
  }));
}

function artifactSetSha256(artifacts) {
  return sha256(artifacts.map((entry) =>
    `${entry.path}\0${entry.kind}\0${entry.sha256}\0${entry.bytes}\n`
  ).join(""));
}

function assertPrimary(primary, expected) {
  if (
    primary?.schemaVersion !== 1
    || primary.gate !== "PASS"
    || primary.finalSha !== expected.sha
    || primary.sourceTree !== expected.sourceTree
  ) {
    throw new ReleaseInputError("verify-v2 runtime evidence source identity mismatch");
  }
  if (
    primary.command?.exitCode !== 0
    || !Array.isArray(primary.command.argv)
    || primary.command.argv.length === 0
  ) {
    throw new ReleaseInputError("invalid verify-v2 command evidence");
  }
  normalizeDigest(primary.command.stdoutSha256, "verify-v2 stdout digest");
  normalizeDigest(primary.command.stderrSha256, "verify-v2 stderr digest");
}

export async function createVerifyV2RuntimeEvidence(options) {
  const sha = assertHex(options.sha, 40, "sha");
  const sourceTree = assertHex(options.sourceTree, 40, "source-tree");
  const registry = await loadRegistry(options.registry);
  const first = await snapshotArtifacts(
    options.evidenceDir,
    registry,
    options.afterFirstSnapshot,
  );
  const artifacts = manifestArtifacts(first.artifacts);
  const primary = {
    schemaVersion: 1,
    gate: "PASS",
    finalSha: sha,
    sourceTree,
    command: {
      argv: options.command.argv,
      exitCode: options.command.exitCode,
      stdoutSha256: normalizeDigest(options.command.stdoutSha256, "verify-v2 stdout digest"),
      stderrSha256: normalizeDigest(options.command.stderrSha256, "verify-v2 stderr digest"),
    },
    runtimeEvidence: {
      schemaVersion: 1,
      artifactRoot: first.directory,
      registry: { path: registry.path, sha256: registry.sha256 },
      artifactCount: artifacts.length,
      artifactSetSha256: artifactSetSha256(artifacts),
      artifacts,
    },
  };
  await validateManifest(primary, { sha, sourceTree, registry: options.registry });
  return primary;
}

async function validateManifest(primary, expected) {
  assertPrimary(primary, expected);
  const registry = await loadRegistry(expected.registry);
  const manifest = primary.runtimeEvidence;
  if (
    manifest?.schemaVersion !== 1
    || manifest.registry?.path !== registry.path
    || manifest.registry.sha256 !== registry.sha256
    || manifest.artifactCount !== registry.artifacts.length
    || !Array.isArray(manifest.artifacts)
    || manifest.artifacts.length !== registry.artifacts.length
  ) {
    throw new ReleaseInputError("invalid verify-v2 runtime evidence manifest");
  }
  const observed = await snapshotArtifacts(manifest.artifactRoot, registry);
  for (let index = 0; index < observed.artifacts.length; index += 1) {
    const actual = observed.artifacts[index];
    const recorded = manifest.artifacts[index];
    const expectedArtifact = registry.artifacts[index];
    if (
      recorded?.path !== expectedArtifact.path
      || recorded.kind !== expectedArtifact.kind
      || recorded.sha256 !== actual.sha256
      || recorded.bytes !== actual.bytes
    ) {
      throw new ReleaseInputError(`verify-v2 runtime artifact digest mismatch: ${expectedArtifact.path}`);
    }
  }
  if (manifest.artifactSetSha256 !== artifactSetSha256(manifest.artifacts)) {
    throw new ReleaseInputError("verify-v2 runtime artifact-set digest mismatch");
  }
  return observed.artifacts;
}

export async function validateVerifyV2RuntimeEvidence(options) {
  const snapshot = await snapshotRegularFile(resolve(options.input), "verify-v2 runtime primary");
  const primary = parseJson(snapshot, "verify-v2 runtime primary");
  const artifacts = await validateManifest(primary, {
    sha: assertHex(options.sha, 40, "sha"),
    sourceTree: assertHex(options.sourceTree, 40, "source-tree"),
    registry: options.registry,
  });
  return { primary, primarySnapshot: snapshot, artifacts };
}
