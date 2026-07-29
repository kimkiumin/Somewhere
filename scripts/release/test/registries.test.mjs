import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readJson, removeTemporaryDirectory, run, temporaryDirectory, writeJson } from "./release-testkit.mjs";

const repo = resolve(import.meta.dir, "../../..");
const requiredScripts = [
  "materialize-planned-tree.mjs",
  "validate-plan-evidence.mjs",
  "verify-evidence-manifest.mjs",
  "run-red-team.mjs",
  "validate-red-team-receipt.mjs",
  "scan-production.mjs",
  "validate-blueprint-receipt.mjs",
  "verify-build-receipt.mjs",
  "audit-scope.mjs",
  "capture-command-receipt.mjs",
  "run-bound-review.mjs",
  "validate-lighthouse-budget.mjs",
  "assemble-lane-checks.mjs",
  "validate-lane-verdict.mjs",
  "prepare-final-wave.mjs",
  "run-final-lane.mjs",
  "verify-final-cleanup.mjs",
  "validate-final-verdict.mjs",
  "seal-final-manifest.mjs",
];
const requiredSchemas = [
  "planned-tree-receipt-v1.schema.json",
  "command-receipt-v1.schema.json",
  "check-manifest-v1.schema.json",
  "lane-verdict-v1.schema.json",
  "preparation-receipt-v1.schema.json",
  "external-gates-v1.schema.json",
  "reviewer-verdict-v1.schema.json",
  "final-cleanup-v1.schema.json",
  "final-lane-commands-v1.schema.json",
  "final-verdict-v1.schema.json",
];
const requiredRegistries = [
  "final-lane-commands-v1.json",
  "final-lane-checks-v1.json",
  "plan-criteria-v1.json",
  "red-team-cases-v1.json",
  "forbidden-production-patterns-v1.json",
  "v2-must-not-v1.json",
  "reviewer-profile-f1-plan-v1.json",
  "reviewer-profile-f2-code-v1.json",
  "reviewer-profile-f2-runtime-v1.json",
  "reviewer-profile-f2-security-v1.json",
  "reviewer-profile-f3-visual-v1.json",
  "reviewer-profile-f4-scope-v1.json",
];

describe("Todo 22 release registry", () => {
  test("contains every frozen final-wave executable and machine contract", async () => {
    for (const name of [...requiredScripts, ...requiredSchemas, ...requiredRegistries]) {
      await access(resolve(repo, "scripts/release", name));
    }
    const checks = JSON.parse(
      await readFile(resolve(repo, "scripts/release/final-lane-checks-v1.json"), "utf8"),
    );
    expect(checks.lanes.F1).toEqual(["plan-evidence", "reviewer-verdict", "manifest-check"]);
    expect(checks.lanes.F3.external).toEqual(["device-verdict"]);
  });

  test("help is side-effect free and documents the exact preparation boundary", () => {
    const result = run(repo, ["bun", "scripts/release/prepare-final-wave.mjs", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("--evidence-root");
    expect(result.stdout.toString()).toContain("--plan-sha256");
  });

  test("curl contract exposes the final-lane base URL and JSON output boundary", () => {
    const result = run(repo, ["bash", "scripts/release/curl-v2-contract.sh", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("--base-url");
    expect(result.stdout.toString()).toContain("--output");
  });

  test("scope audit catches stale cost, API, Reroll, bearing, and release claims", async () => {
    const root = await temporaryDirectory("scope-mutation");
    try {
      const original = JSON.parse(await readFile(resolve(repo, "docs/authority-map-v2.json"), "utf8"));
      const mutations = [
        ["cost", (value) => { value.costPolicy.warningFraction = 0.9; }],
        ["api", (value) => { value.backend.providerMode = "unreviewed live public API"; }],
        ["reroll", (value) => { value.product.activeReroll = true; }],
        ["bearing", (value) => { value.product.directBearingFallback = true; }],
        ["release", (value) => { value.backend.productionDeployed = true; }],
      ];
      for (const [name, mutate] of mutations) {
        const authority = structuredClone(original);
        mutate(authority);
        const mutated = resolve(root, `${name}.json`);
        await writeJson(mutated, authority);
        const output = resolve(root, `${name}-scope.json`);
        const result = run(repo, [
          "bun",
          "scripts/release/audit-scope.mjs",
          "--authority",
          mutated,
          "--root",
          repo,
          "--must-not",
          "scripts/release/v2-must-not-v1.json",
          "--sha",
          "a".repeat(40),
          "--output",
          output,
        ]);
        expect(result.exitCode).not.toBe(0);
        expect((await readJson(output)).gate).toBe("FAIL");
      }
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("release configuration and canonical documentation are internally linked", () => {
    const result = run(repo, ["bun", "scripts/release/validate-release-config.mjs"]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toMatchObject({
      schemaVersion: 1,
      gate: "PASS",
    });
  });
});
