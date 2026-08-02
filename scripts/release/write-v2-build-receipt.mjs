import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertCleanSource,
  assertSameCleanSource,
  captureCleanSource,
} from "./source-cleanliness.mjs";

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

export async function writeBuildReceipt({ beforeEmit = async () => {}, output, repo }) {
  const source = captureCleanSource(repo);
  await rm(output, { force: true });
  const receipt = {
    schemaVersion: 1,
    sourceSha: source.sha,
    sourceTree: source.tree,
    buildDigest: await buildDigest(repo),
    builtAt: new Date().toISOString(),
    command: "bun run local:v2:prepare",
  };
  await beforeEmit();
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`);
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

async function main() {
  const repo = path.resolve(process.argv[2] ?? ".");
  const checkOnly = process.argv[3] === "--check-only";
  const output = path.resolve(
    (checkOnly ? undefined : process.argv[3]) ??
      process.env.V2_EVIDENCE_DIR ??
      path.join(repo, ".omo/evidence/task-19"),
    "build-receipt.json",
  );
  assertCleanSource(repo);
  if (checkOnly) {
    process.stdout.write("PASS clean source\n");
    return;
  }
  await writeBuildReceipt({ output, repo });
  process.stdout.write(`${output}\n`);
}

if (import.meta.main) await main();
