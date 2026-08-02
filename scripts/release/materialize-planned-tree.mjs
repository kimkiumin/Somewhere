import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  assertExternalPath,
  assertHex,
  git,
  mainBoundary,
  parseArguments,
  run,
  writeJson,
} from "./lib/release-core.mjs";
import {
  assertSameTree,
  inventory,
  inventoryDigest,
  parseGitTree,
} from "./lib/tree-inventory.mjs";

const specification = {
  required: ["--repo", "--tree", "--destination", "--receipt"],
};

async function materialize(options) {
  assertHex(options.tree, 40, "tree");
  const repo = resolve(options.repo);
  const destination = await assertExternalPath(repo, options.destination, "destination");
  const receipt = await assertExternalPath(repo, options.receipt, "receipt");
  const objectType = await git(repo, ["cat-file", "-t", options.tree]);
  if (objectType !== "tree") throw new TypeError("tree is not a Git tree object");
  const temporary = await mkdtemp(resolve(dirname(destination), ".somewhere-materialize."));
  const archive = resolve(temporary, "source.tar");
  try {
    const archived = await run(["git", "-C", repo, "archive", "--format=tar", "--output", archive, options.tree], {
      cwd: repo,
      env: process.env,
    });
    if (archived.exitCode !== 0) throw new TypeError(archived.stderr.toString().trim());
    const extracted = resolve(temporary, "tree");
    await mkdir(extracted);
    const unpacked = await run(["tar", "-xf", archive, "-C", extracted], { cwd: temporary, env: process.env });
    if (unpacked.exitCode !== 0) throw new TypeError(unpacked.stderr.toString().trim());
    const expected = parseGitTree(await git(repo, ["ls-tree", "-rz", options.tree]));
    const observed = await inventory(extracted);
    assertSameTree(expected, observed);
    await rename(extracted, destination);
    await writeJson(receipt, {
      schemaVersion: 1,
      gate: "PASS",
      sourceTree: options.tree,
      destination,
      inventoryDigest: inventoryDigest(observed),
      fileCount: observed.length,
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => materialize(parsed), parsed.receipt);
