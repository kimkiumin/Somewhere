import { resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
import {
  digestFile,
  git,
  mainBoundary,
  parseArguments,
  writeJson,
} from "./lib/release-core.mjs";

const specification = {
  required: ["--source-commit", "--receipt", "--root", "--output"],
};

async function validate(options) {
  const root = resolve(options.root);
  const receiptPath = resolve(root, options.receipt);
  const sourceCommit = await git(root, ["rev-parse", `${options["source-commit"]}^{commit}`]);
  const receiptText = await readFile(receiptPath, "utf8");
  if (!receiptText.includes(`Source commit: \`${sourceCommit}\``)) {
    throw new TypeError("blueprint source commit mismatch");
  }
  const rowPattern = /^\| `([^`]+)` \| `(100644|100755)` \| ([0-9]+) \| `([a-f0-9]{40})` \| `([a-f0-9]{64})` \|$/gm;
  const rows = [...receiptText.matchAll(rowPattern)];
  if (rows.length !== 9) throw new TypeError("blueprint receipt must contain exactly nine rows");
  const artifacts = [];
  for (const row of rows) {
    const [, path, mode, bytesText, sourceBlob, expectedSha] = row;
    const absolute = resolve(root, path);
    const sourceEntry = await git(root, ["ls-tree", sourceCommit, "--", path]);
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t/.exec(sourceEntry);
    if (match === null || match[1] !== mode || match[2] !== sourceBlob) {
      throw new TypeError(`source blob mismatch: ${path}`);
    }
    const observedSha = await digestFile(absolute);
    const file = await stat(absolute);
    if (file.size !== Number(bytesText) || observedSha !== `sha256:${expectedSha}`) {
      throw new TypeError(`blueprint bytes mismatch: ${path}`);
    }
    const currentBlob = await git(root, ["hash-object", path]);
    if (currentBlob !== sourceBlob) throw new TypeError(`current blob mismatch: ${path}`);
    artifacts.push({ path, mode, bytes: file.size, sourceBlob, sha256: observedSha });
  }
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate: "PASS",
    sourceCommit,
    receiptSha256: await digestFile(receiptPath),
    artifacts,
  });
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => validate(parsed), parsed.output);
