import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repo = path.resolve(process.argv[2] ?? ".");
const output = path.resolve(
  process.argv[3] ?? process.env.V2_EVIDENCE_DIR ?? path.join(repo, ".omo/evidence/task-19"),
  "build-receipt.json",
);

function git(values) {
  const result = spawnSync("git", ["-C", repo, ...values], { encoding: "utf8" });
  if (result.status !== 0) throw new TypeError(result.stderr.trim());
  return result.stdout.trim();
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

async function buildDigest() {
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

await mkdir(path.dirname(output), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      sourceSha: git(["rev-parse", "HEAD"]),
      sourceTree: git(["write-tree"]),
      buildDigest: await buildDigest(),
      builtAt: new Date().toISOString(),
      command: "bun run local:v2:prepare",
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`${output}\n`);
