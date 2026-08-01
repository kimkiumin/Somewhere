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
  "validate-workflows.mjs",
  "validate-ci-verdict.mjs",
  "validate-todo20-evidence.mjs",
  "build-production.mjs",
  "write-prepared-build-reference.mjs",
  "run-verify-v2.mjs",
  "run-bun-audit.mjs",
  "verify-rc-build-binding.mjs",
  "verify-staging-seal.mjs",
  "validate-https-origin.mjs",
  "validate-verify-v2-runtime-evidence.mjs",
];
const requiredSchemas = [
  "exact-tree-receipt-v1.schema.json",
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
  "todo20-artifacts-v1.json",
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
  "verify-v2-runtime-artifacts-v1.json",
];

describe("Todo 22 release registry", () => {
  test("contains every frozen final-wave executable and machine contract", async () => {
    for (const name of [...requiredScripts, ...requiredSchemas, ...requiredRegistries]) {
      await access(resolve(repo, "scripts/release", name));
    }
    const checks = JSON.parse(
      await readFile(resolve(repo, "scripts/release/final-lane-checks-v1.json"), "utf8"),
    );
    expect(checks.lanes.F1).toEqual([
      "plan-evidence",
      "todo20-evidence",
      "reviewer-verdict",
      "manifest-check",
    ]);
    expect(checks.lanes.F2.slice(0, 3)).toEqual([
      "workflow-safety",
      "ci-release-block",
      "verify-v2",
    ]);
    expect(checks.lanes.F3.external).toEqual(["device-verdict"]);
  });

  test("help is side-effect free and documents the exact preparation boundary", () => {
    const result = run(repo, ["bun", "scripts/release/prepare-final-wave.mjs", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("--evidence-root");
    expect(result.stdout.toString()).toContain("--plan-sha256");
  });

  test("routes verify-v2 and every bound F2 reviewer through the runtime manifest", async () => {
    const commands = await readJson(resolve(repo, "scripts/release/final-lane-commands-v1.json"));
    const verify = commands.lanes.F2.find((entry) => entry.id === "verify-v2");
    expect(verify.argv.slice(0, 2)).toEqual([
      "bun",
      "scripts/release/run-verify-v2.mjs",
    ]);
    expect(verify.argv).toContain("${FINAL_SHA}");
    expect(verify.argv).toContain("${SOURCE_TREE}");
    expect(verify.argv).toContain("${FINAL_ROOT}/F2/verify-ops");
    for (const id of ["review-work", "debugging", "security"]) {
      const reviewer = commands.lanes.F2.find((entry) => entry.id === id);
      const inputs = reviewer.argv[reviewer.argv.indexOf("--inputs") + 1];
      expect(inputs).toContain("${FINAL_ROOT}/F2/verify-v2-verdict.json");
      expect(reviewer.argv).toEqual(expect.arrayContaining([
        "--prepared-build-root",
        "${FINAL_ROOT}/prepared/build",
        "--prepared-build-receipt",
        "${BUILD_RECEIPT}",
        "--prepared-source-archive",
        "${FINAL_ROOT}/prepared/source.tar",
      ]));
    }
  });

  test("binds the selected navigation policy as an inspectable F1 input", async () => {
    const commands = await readJson(resolve(repo, "scripts/release/final-lane-commands-v1.json"));
    const planEvidence = commands.lanes.F1.find((entry) => entry.id === "plan-evidence");
    expect(planEvidence.argv).toEqual(expect.arrayContaining([
      "--policy",
      "${POLICY}",
      "--policy-sha256",
      "${POLICY_SHA}",
    ]));
  });

  test("routes dependency audit through an exact-source receipt", async () => {
    // Given: the canonical F2 command registry.
    const commands = await readJson(resolve(repo, "scripts/release/final-lane-commands-v1.json"));

    // When: the dependency audit command is resolved.
    const audit = commands.lanes.F2.find((entry) => entry.id === "bun-audit");

    // Then: the primary is produced by the SHA/tree and lockfile-aware wrapper.
    expect(audit.argv.slice(0, 2)).toEqual(["bun", "scripts/release/run-bun-audit.mjs"]);
    expect(audit.argv).toEqual(expect.arrayContaining([
      "${FINAL_SHA}",
      "${SOURCE_TREE}",
      "bun.lock",
      "${FINAL_ROOT}/F2/bun-audit-raw.json",
    ]));
  });

  test("routes the F3 device gate through exact RC and build binding", async () => {
    // Given: the canonical final-lane command registry.
    const commands = await readJson(resolve(repo, "scripts/release/final-lane-commands-v1.json"));

    // When: the external physical-device check is resolved.
    const device = commands.lanes.F3.find((entry) => entry.id === "device-verdict");

    // Then: it must use the verifier that binds evidence to the exact promoted policy and build.
    expect(device.argv.slice(0, 2)).toEqual([
      "bun",
      "scripts/release/verify-rc-build-binding.mjs",
    ]);
    expect(device.argv).toEqual(expect.arrayContaining([
      "--repo",
      "${REPO}",
      "--policy",
      "${POLICY}",
      "--promotion-receipt",
      "${RC_PROMOTION_RECEIPT}",
      "--build-receipt",
      "${BUILD_RECEIPT}",
      "--evidence",
      "${SHARED_EVIDENCE_ROOT}/physical-iphone",
    ]));
  });

  test("binds the F4 scope reviewer to the prepared build receipt", async () => {
    const commands = await readJson(resolve(repo, "scripts/release/final-lane-commands-v1.json"));
    const reviewer = commands.lanes.F4.find((entry) => entry.id === "reviewer-verdict");
    const inputs = reviewer.argv[reviewer.argv.indexOf("--inputs") + 1].split(",");

    expect(inputs).toContain("${BUILD_RECEIPT}");
  });

  test("expands F1 machine-bound evidence only from the shared evidence root", async () => {
    const commands = await readJson(resolve(repo, "scripts/release/final-lane-commands-v1.json"));
    const reviewer = commands.lanes.F1.find((entry) => entry.id === "reviewer-verdict");

    expect(reviewer.argv).toEqual(expect.arrayContaining([
      "--review-root",
      "${SHARED_EVIDENCE_ROOT}",
    ]));
  });

  test("binds the standalone Wrangler dry run to the production environment", async () => {
    const script = await readFile(resolve(repo, "scripts/operations/verify-ops.sh"), "utf8");
    expect(script).toContain("wrangler deploy --dry-run --env=production");
    expect(script).not.toContain("--env=\"\"");
  });

  test("curl contract exposes the final-lane base URL and JSON output boundary", () => {
    const result = run(repo, ["bash", "scripts/release/curl-v2-contract.sh", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("--base-url");
    expect(result.stdout.toString()).toContain("--output");
  });

  test("uses one installed app-local Playwright runner for final browser lanes", async () => {
    const root = await temporaryDirectory("final-playwright-list");
    try {
      const registry = await readJson(
        resolve(repo, "scripts/release/final-lane-commands-v1.json"),
      );
      for (const id of ["chromium", "webkit"]) {
        const command = registry.lanes.F3.find((entry) => entry.id === id);
        expect(command.argv.slice(0, 3)).toEqual([
          "bun",
          "app/node_modules/@playwright/test/cli.js",
          "test",
        ]);
        expect(command.argv).not.toContain("bunx");
        expect(command.argv).not.toContain("--package");
        const environment = {
          SOMEWHERE_PREPARED_BASE_URL: "https://127.0.0.1:8788",
          PLAYWRIGHT_JUNIT_OUTPUT_NAME: resolve(root, `${id}.xml`),
          V2_EVIDENCE_DIR: resolve(root, `${id}-evidence`),
        };
        const argv = command.argv.map((value) =>
          value.replaceAll("${TEMP_ROOT}", root).replaceAll("${FINAL_ROOT}", root)
        );
        const listed = run(repo, [...argv, "--list"], environment);
        expect(listed.exitCode).toBe(0);
        expect(listed.stdout.toString()).toContain("Total: 4 tests in 1 file");
      }
    } finally {
      await removeTemporaryDirectory(root);
    }
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
