import { gzipSync } from "node:zlib";
import { resolve, sep } from "node:path";
import {
  assertRegularFile,
  digestFile,
  mainBoundary,
  normalizeDigest,
  parseArguments,
  readJson,
  run,
  writeJson,
} from "./lib/release-core.mjs";

const specification = {
  required: ["--url", "--lighthouse-version", "--raw", "--build-receipt", "--minimum-benchmark-index", "--lcp-ms", "--cls", "--inp-ms", "--compressed-initial-bytes", "--output"],
};

async function compressedBytes(receiptPath) {
  const receipt = await readJson(receiptPath);
  const root = resolve(receiptPath, "../..");
  let total = 0;
  for (const artifact of receipt.artifacts) {
    if (artifact.kind !== "app-asset" || !/\.(html|css|js)$/.test(artifact.path)) continue;
    const path = resolve(root, artifact.path);
    if (!path.startsWith(`${root}${sep}`)) throw new TypeError("unsafe build artifact path");
    await assertRegularFile(path, `Lighthouse build artifact ${artifact.path}`);
    if (await digestFile(path) !== normalizeDigest(artifact.sha256)) {
      throw new TypeError(`Lighthouse build artifact digest mismatch: ${artifact.path}`);
    }
    total += gzipSync(Buffer.from(await Bun.file(path).arrayBuffer())).byteLength;
  }
  return total;
}

async function validate(options) {
  const raw = resolve(options.raw);
  if (!(await Bun.file(raw).exists())) {
    const invoked = await run([
      "bunx",
      `lighthouse@${options["lighthouse-version"]}`,
      options.url,
      "--output=json",
      `--output-path=${raw}`,
      "--chrome-flags=--headless --no-sandbox --ignore-certificate-errors",
      "--quiet",
    ], { cwd: resolve("."), env: process.env });
    if (invoked.exitCode !== 0) throw new TypeError(invoked.stderr.toString().trim());
  }
  const report = await readJson(raw);
  if (report.lighthouseVersion !== options["lighthouse-version"]) {
    throw new TypeError("Lighthouse report version mismatch");
  }
  const lcp = report.audits?.["largest-contentful-paint"]?.numericValue;
  const cls = report.audits?.["cumulative-layout-shift"]?.numericValue;
  const inpAudit = report.audits?.["interaction-to-next-paint"] ?? report.audits?.["total-blocking-time"];
  const inp = inpAudit?.numericValue;
  const benchmarkIndex = report.environment?.benchmarkIndex;
  const minimumBenchmarkIndex = Number(options["minimum-benchmark-index"]);
  if (![lcp, cls, inp, benchmarkIndex].every((value) => typeof value === "number")) {
    throw new TypeError("Lighthouse report misses required metrics");
  }
  if (!Number.isFinite(minimumBenchmarkIndex) || minimumBenchmarkIndex <= 0) {
    throw new TypeError("Lighthouse minimum benchmark index must be positive");
  }
  const compressed = await compressedBytes(resolve(options["build-receipt"]));
  const budgets = {
    lcp: lcp <= Number(options["lcp-ms"]),
    cls: cls <= Number(options.cls),
    inp: inp <= Number(options["inp-ms"]),
    compressed: compressed <= Number(options["compressed-initial-bytes"]),
  };
  const hostQualified = benchmarkIndex >= minimumBenchmarkIndex;
  const gate = hostQualified
    ? Object.values(budgets).every(Boolean) ? "PASS" : "FAIL"
    : "BLOCK";
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate,
    ...(hostQualified ? {} : { reason: "UNQUALIFIED_HOST_BENCHMARK" }),
    lighthouseVersion: options["lighthouse-version"],
    environment: { benchmarkIndex, minimumBenchmarkIndex },
    metrics: { lcpMs: lcp, cls, interactionMs: inp, interactionSource: inpAudit.id, compressedInitialBytes: compressed },
    budgets,
  });
  if (gate === "BLOCK") process.exitCode = 2;
  if (gate === "FAIL") process.exitCode = 1;
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => validate(parsed), parsed.output);
