import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { collectBuildProvenance } from "../lib/build-provenance.mjs";
import { sha256 } from "../lib/release-core.mjs";
import { inspectSourceArchive } from "../lib/source-archive.mjs";
import { run, writeJson } from "./release-testkit.mjs";
import { writeFixtureCommand } from "./runtime-semantic-fixture.mjs";

export const repo = resolve(import.meta.dir, "../../..");
export const registry = resolve(repo, "scripts/release/verify-v2-runtime-artifacts-v1.json");
export const finalSha = "a".repeat(40);
const sourcePaths = [
  "bun.lock",
  "package.json",
  "app/package.json",
  "contracts/package.json",
  "server/package.json",
  "server/test/async-alarm-todo12.runtime.ts",
  "server/test/journey-do-cloudflare.runtime.ts",
  "server/test/task14-feedback-epoch.test.ts",
];
const sourceArchiveResult = run(repo, ["tar", "-cf", "-", ...sourcePaths]);
if (sourceArchiveResult.exitCode !== 0) {
  throw new Error("prepared source archive fixture could not be created");
}
const sourceArchiveBytes = Buffer.from(sourceArchiveResult.stdout);
export const sourceTree = inspectSourceArchive(sourceArchiveBytes).sourceTree;

export async function preparedFixture(root) {
  const prepared = resolve(root, "prepared");
  const buildRoot = resolve(prepared, "build");
  const artifactPath = "prepared/build/app/dist/index.html";
  const artifactFile = resolve(root, artifactPath);
  await mkdir(resolve(buildRoot, "app/dist"), { recursive: true });
  await writeFile(artifactFile, "<!doctype html>\n");
  const artifactBytes = await readFile(artifactFile);
  const artifacts = [{
    path: artifactPath,
    kind: "app-asset",
    sha256: sha256(artifactBytes),
    bytes: artifactBytes.byteLength,
  }];
  const sourceArchive = resolve(prepared, "source.tar");
  await writeFile(sourceArchive, sourceArchiveBytes);
  const receipt = resolve(prepared, "build-receipt.json");
  await writeJson(receipt, {
    schemaVersion: 2,
    finalSha,
    sourceTree,
    artifacts,
    buildDigest: sha256(artifacts.map((entry) =>
      `${entry.sha256}\t${entry.bytes}\t${entry.path}\0`
    ).join("")),
    provenance: await collectBuildProvenance(repo),
  });
  return { buildRoot, receipt, sourceArchive };
}

export async function capture(root, mode = "complete", exact = false) {
  const fixture = await writeFixtureCommand(root);
  const evidence = resolve(root, "verify-ops");
  const output = resolve(root, "verify-v2-verdict.json");
  const prepared = exact ? await preparedFixture(root) : undefined;
  const argv = [
    "bun",
    "scripts/release/run-verify-v2.mjs",
    "--sha",
    finalSha,
    "--source-tree",
    sourceTree,
    "--registry",
    registry,
    "--evidence-dir",
    evidence,
    "--output",
    output,
    "--argv-json",
    JSON.stringify(["bun", fixture]),
    ...(prepared === undefined ? [] : [
      "--prepared-build-root",
      prepared.buildRoot,
      "--prepared-build-receipt",
      prepared.receipt,
      "--prepared-source-archive",
      prepared.sourceArchive,
    ]),
  ];
  const result = run(repo, argv, { RUNTIME_FIXTURE_MODE: mode });
  return { evidence, output, prepared, result };
}

export function validate(input, output, sha = finalSha, tree = sourceTree) {
  return run(repo, [
    "bun",
    "scripts/release/validate-verify-v2-runtime-evidence.mjs",
    "--input",
    input,
    "--sha",
    sha,
    "--source-tree",
    tree,
    "--registry",
    registry,
    "--output",
    output,
  ]);
}
