import { resolve, sep } from "node:path";
import {
  assertRegularFile,
  digestFile,
  mainBoundary,
  parseArguments,
  readJson,
  writeJson,
} from "./lib/release-core.mjs";

const specification = {
  required: ["--build-receipt", "--final-root", "--deny", "--output"],
  optional: ["--selftest"],
};

async function scan(options) {
  if (options.selftest !== undefined) throw new TypeError(options.selftest);
  const root = resolve(options["final-root"]);
  const receipt = await readJson(resolve(options["build-receipt"]));
  const deny = await readJson(resolve(options.deny));
  const patterns = Array.isArray(deny.patterns)
    ? deny.patterns
    : Array.isArray(deny.productionPatterns)
      ? deny.productionPatterns.map((literal) => ({ id: literal, literal }))
      : undefined;
  if (!Array.isArray(receipt.artifacts) || patterns === undefined) {
    throw new TypeError("invalid build receipt or deny registry");
  }
  const scanned = [];
  const findings = [];
  for (const artifact of receipt.artifacts) {
    if (!["app-asset", "worker-bundle", "asset-manifest"].includes(artifact.kind)) continue;
    const path = resolve(root, artifact.path);
    if (!path.startsWith(`${root}${sep}`)) {
      throw new TypeError("build artifact path or digest mismatch");
    }
    await assertRegularFile(path, `production artifact ${artifact.path}`);
    if (await digestFile(path) !== artifact.sha256) throw new TypeError("build artifact path or digest mismatch");
    const bytes = await Bun.file(path).arrayBuffer();
    const text = Buffer.from(bytes).toString("utf8");
    for (const pattern of patterns) {
      if (text.includes(pattern.literal)) findings.push({ artifact: artifact.path, pattern: pattern.id });
    }
    scanned.push(artifact.path);
  }
  if (scanned.length === 0) throw new TypeError("no production artifacts were scanned");
  const gate = findings.length === 0 ? "PASS" : "FAIL";
  const buildReceipt = resolve(options["build-receipt"]);
  const buildReceiptSha256 = await digestFile(buildReceipt);
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate,
    scanned,
    findings,
    buildReceiptSha256,
    reviewBindings: [{ path: buildReceipt, sha256: buildReceiptSha256 }],
  });
  if (gate !== "PASS") process.exitCode = 1;
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => scan(parsed), parsed.output);
