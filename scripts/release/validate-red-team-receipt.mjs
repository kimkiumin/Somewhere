import { resolve } from "node:path";
import {
  digestFile,
  mainBoundary,
  parseArguments,
  readJson,
  run,
  writeJson,
} from "./lib/release-core.mjs";

const specification = {
  required: ["--run", "--manifest", "--state-dir", "--sha", "--raw", "--output"],
};

async function validate(options) {
  const runner = resolve(options.run);
  const raw = resolve(options.raw);
  const executed = await run([
    "bun",
    runner,
    "--manifest",
    options.manifest,
    "--state-dir",
    options["state-dir"],
    "--sha",
    options.sha,
    "--output",
    raw,
  ], { cwd: resolve("."), env: process.env });
  if (executed.exitCode !== 0) throw new TypeError("red-team runner failed");
  const manifest = await readJson(resolve(options.manifest));
  const receipt = await readJson(raw);
  const expectedIds = manifest.cases.map((entry) => entry.id).sort();
  const executedIds = [...receipt.executedIds].sort();
  const resultIds = receipt.results.map((entry) => entry.id).sort();
  if (
    receipt.sourceSha !== options.sha
    || JSON.stringify(expectedIds) !== JSON.stringify(executedIds)
    || JSON.stringify(expectedIds) !== JSON.stringify(resultIds)
    || receipt.results.some((entry) => entry.result !== "NEGATIVE_PASS")
  ) {
    throw new TypeError("red-team receipt coverage mismatch");
  }
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate: "PASS",
    sourceSha: options.sha,
    caseCount: expectedIds.length,
    executedIds: expectedIds,
    rawSha256: await digestFile(raw),
    reviewBindings: [{ path: raw, sha256: await digestFile(raw) }],
  });
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => validate(parsed), parsed.output);
