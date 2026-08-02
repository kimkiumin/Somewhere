import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
  writeJson,
} from "./release-testkit.mjs";

const repo = resolve(import.meta.dir, "../../..");

async function evaluate(root, benchmarkIndex, interactionMs) {
  const asset = resolve(root, "prepared/build/app/dist/index.html");
  await mkdir(resolve(asset, ".."), { recursive: true });
  await writeFile(asset, "<main>Somewhere</main>\n");
  const assetDigest = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(asset).arrayBuffer())
    .digest("hex");
  const receipt = resolve(root, "prepared/build-receipt.json");
  await writeJson(receipt, {
    artifacts: [
      {
        kind: "app-asset",
        path: "prepared/build/app/dist/index.html",
        sha256: `sha256:${assetDigest}`,
      },
    ],
  });
  const raw = resolve(root, "lighthouse.json");
  await writeJson(raw, {
    lighthouseVersion: "13.4.1",
    environment: { benchmarkIndex },
    audits: {
      "largest-contentful-paint": { numericValue: 2214.17 },
      "cumulative-layout-shift": { numericValue: 0 },
      "total-blocking-time": { id: "total-blocking-time", numericValue: interactionMs },
    },
  });
  const output = resolve(root, "verdict.json");
  const result = run(repo, [
    "bun",
    "scripts/release/validate-lighthouse-budget.mjs",
    "--url",
    "https://127.0.0.1:8788/",
    "--lighthouse-version",
    "13.4.1",
    "--raw",
    raw,
    "--build-receipt",
    receipt,
    "--minimum-benchmark-index",
    "2000",
    "--lcp-ms",
    "2500",
    "--cls",
    "0.1",
    "--inp-ms",
    "200",
    "--compressed-initial-bytes",
    "153600",
    "--output",
    output,
  ]);
  return { exitCode: result.exitCode, verdict: await readJson(output) };
}

describe("Lighthouse performance budget", () => {
  test("blocks an unqualified host before attributing its TBT to the product", async () => {
    // Given: the canonical failing metrics collected while the host benchmark was depressed.
    const root = await temporaryDirectory("lighthouse-host");
    try {
      // When: the release budget validator evaluates the report.
      const result = await evaluate(root, 1200.5, 260.305);

      // Then: environmental contention cannot become a product regression.
      expect(result.exitCode).toBe(2);
      expect(result.verdict).toMatchObject({
        gate: "BLOCK",
        reason: "UNQUALIFIED_HOST_BENCHMARK",
        environment: { benchmarkIndex: 1200.5, minimumBenchmarkIndex: 2000 },
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("passes a qualified host only when the original TBT budget passes", async () => {
    // Given: a qualified host and a measurement exactly at the existing budget.
    const root = await temporaryDirectory("lighthouse-pass");
    try {
      // When: the release budget validator evaluates the report.
      const result = await evaluate(root, 2200, 200);

      // Then: the original inclusive 200 ms threshold still passes.
      expect(result.exitCode).toBe(0);
      expect(result.verdict).toMatchObject({
        gate: "PASS",
        budgets: { inp: true },
        environment: { benchmarkIndex: 2200, minimumBenchmarkIndex: 2000 },
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("fails a qualified host when TBT exceeds the original budget", async () => {
    // Given: a qualified host whose product measurement is over budget.
    const root = await temporaryDirectory("lighthouse-fail");
    try {
      // When: the release budget validator evaluates the report.
      const result = await evaluate(root, 2200, 200.001);

      // Then: host qualification cannot relax the product threshold.
      expect(result.exitCode).toBe(1);
      expect(result.verdict).toMatchObject({
        gate: "FAIL",
        budgets: { inp: false },
        environment: { benchmarkIndex: 2200, minimumBenchmarkIndex: 2000 },
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
