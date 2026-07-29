import { describe, expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
  writeJson,
} from "./release-testkit.mjs";

const repo = resolve(import.meta.dir, "../../..");

const unsafeFixtures = [
  ["false-pass-missing-credential", "FALSE_RELEASE_PASS_WITHOUT_CREDENTIAL"],
  ["shared-environment-binding", "ENVIRONMENT_BINDING_REUSE"],
  ["lifecycle-gradual-rollback", "DO_LIFECYCLE_ROLLBACK_UNSAFE"],
  ["migration-without-backup", "MIGRATION_BACKUP_MISSING"],
  ["private-cache-leak", "PRIVATE_RESPONSE_CACHEABLE"],
  ["fork-secret-exposure", "UNTRUSTED_EVENT_SECRET_EXPOSURE"],
];

describe("Todo 20 CI and staging gates", () => {
  test("resolves the acceptance root from its checked-out script location", async () => {
    const script = resolve(repo, "scripts/release/cloudflare-acceptance-gates.sh");
    const scriptText = await Bun.file(script).text();
    const result = run("/tmp", [
      "env",
      "-u",
      "SOMEWHERE_ROOT",
      "bash",
      script,
      "config-contract",
    ]);

    expect(scriptText).not.toContain("/home/tjrgus/Somewhere");
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(result.stdout.toString()).toContain("PASS: Wrangler configuration contract");
  });

  test("accepts only one successful D1 result with one exact PASS row", async () => {
    const root = await temporaryDirectory("d1-gate-result");
    try {
      const valid = resolve(root, "valid.json");
      const forged = resolve(root, "forged.json");
      await writeJson(valid, [{ success: true, results: [{ gate: "PASS" }], meta: {} }]);
      await writeJson(forged, [{
        success: true,
        results: [{ gate: "FAIL" }],
        meta: { message: '{"gate":"PASS"}' },
      }]);
      const validator = "scripts/release/validate-d1-gate-result.mjs";

      expect(run(repo, ["bun", validator, "--input", valid]).exitCode).toBe(0);
      expect(run(repo, ["bun", validator, "--input", forged]).exitCode).toBe(1);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("validates the checked-in CI and staging workflows without external writes", async () => {
    // Given the repository workflows and isolated verdict output
    const root = await temporaryDirectory("workflow-verdict");
    try {
      const output = resolve(root, "workflow.json");

      // When the local workflow validator runs
      const result = run(repo, [
        "bun",
        "scripts/release/validate-workflows.mjs",
        "--ci",
        ".github/workflows/v2-ci.yml",
        "--staging",
        ".github/workflows/v2-staging.yml",
        "--wrangler",
        "server/wrangler.jsonc",
        "--output",
        output,
      ]);

      // Then schema and authorization boundaries pass without claiming external protection
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toBe("PASS: workflow safety validated\n");
      expect(await readJson(output)).toMatchObject({
        gate: "PASS",
        schemaValid: true,
        pullRequestSecretsExposed: false,
        stagingEnvironmentProtected: true,
        externalProtectionVerified: false,
        externalWriteInLocalMode: false,
        lifecycleGradualRollbackAllowed: false,
        historicalPagesFrozen: true,
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("reports repository PASS and release BLOCK when external authorities are absent", async () => {
    // Given a valid workflow verdict and the honest blocked release fixture
    const root = await temporaryDirectory("ci-verdict");
    try {
      const workflow = resolve(root, "workflow.json");
      const workflowResult = run(repo, [
        "bun",
        "scripts/release/validate-workflows.mjs",
        "--ci",
        ".github/workflows/v2-ci.yml",
        "--staging",
        ".github/workflows/v2-staging.yml",
        "--wrangler",
        "server/wrangler.jsonc",
        "--output",
        workflow,
      ]);
      expect(workflowResult.exitCode).toBe(0);
      const output = resolve(root, "release.json");

      // When the repository verdict is evaluated
      const result = run(repo, [
        "bun",
        "scripts/release/validate-ci-verdict.mjs",
        "--mode",
        "repository",
        "--source-tree",
        "a".repeat(40),
        "--fixture",
        "scripts/release/fixtures/ci/repository-ready-release-blocked.json",
        "--workflow-verdict",
        workflow,
        "--expect-repository",
        "PASS",
        "--expect-release",
        "BLOCK",
        "--output",
        output,
      ]);

      // Then repository readiness and release authority remain separate
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toBe(
        "PASS: repository ready; release blocked by external gates\n",
      );
      expect(await readJson(output)).toMatchObject({
        repositoryReady: "PASS",
        releaseReady: "BLOCK",
        externalWrites: 0,
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test.each(unsafeFixtures)("fails closed for %s", async (fixture, failureCode) => {
    // Given one independently unsafe release fixture
    const root = await temporaryDirectory("ci-unsafe");
    try {
      const workflow = resolve(root, "workflow.json");
      await writeJson(workflow, {
        gate: "PASS",
        schemaValid: true,
        pullRequestSecretsExposed: false,
        stagingEnvironmentProtected: true,
        externalProtectionVerified: false,
        externalWriteInLocalMode: false,
        lifecycleGradualRollbackAllowed: false,
        historicalPagesFrozen: true,
        environmentBindingsDistinct: true,
      });
      const output = resolve(root, `${fixture}.json`);

      // When the unsafe fixture is evaluated
      const result = run(repo, [
        "bun",
        "scripts/release/validate-ci-verdict.mjs",
        "--mode",
        "repository",
        "--source-tree",
        "a".repeat(40),
        "--fixture",
        `scripts/release/fixtures/ci/${fixture}.json`,
        "--workflow-verdict",
        workflow,
        "--expect-repository",
        "PASS",
        "--expect-release",
        "BLOCK",
        "--output",
        output,
      ]);

      // Then the exact public failure code is emitted without a write
      expect(result.exitCode).toBe(1);
      expect(await readJson(output)).toMatchObject({
        repositoryReady: "FAIL",
        externalWrites: 0,
      });
      expect((await readJson(output)).failingGates).toContain(failureCode);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test.each([
    ["HUP", 129],
    ["INT", 130],
    ["TERM", 143],
  ])("removes the owned process group on %s", async (signal, exitCode) => {
    // Given a signal-specific cleanup receipt path
    const root = await temporaryDirectory("ci-cleanup");
    try {
      const receipt = resolve(root, `${signal}.json`);

      // When the lifecycle helper receives the signal
      const result = run(repo, [
        "bash",
        "scripts/release/test-ci-cleanup-trap.sh",
        "--signal",
        signal,
        "--receipt",
        receipt,
      ]);

      // Then the handler terminates, waits for its group, and removes temp state
      expect(result.exitCode).toBe(exitCode);
      expect(await readJson(receipt)).toMatchObject({
        signal,
        tempRemoved: true,
        handlerTerminated: true,
        processGroupTerminated: true,
        waited: true,
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("keeps the historical Pages deployment frozen", async () => {
    // Given the legacy workflow source
    const text = await readFile(resolve(repo, ".github/workflows/app.yml"), "utf8");

    // When the workflow is inspected for deployment mutations
    const forbidden = ["actions/deploy-pages", "actions/upload-pages-artifact", "pages: write"];

    // Then no current source can overwrite the stable historical origin
    expect(forbidden.filter((literal) => text.includes(literal))).toEqual([]);
  });

  test("exposes a gitless production build interface", () => {
    // Given the root production build command
    const result = run(repo, ["bun", "scripts/release/build-production.mjs", "--help"]);

    // When its contract is queried without building
    // Then external output and receipt paths are mandatory and documented
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("--outdir");
    expect(result.stdout.toString()).toContain("--receipt");
  });

  test("keeps exact-tree dependencies read-only during preflight", async () => {
    const gate = await readFile(
      resolve(repo, "scripts/release/cloudflare-acceptance-gates.sh"),
      "utf8",
    );
    expect(gate).toContain('test -- --configLoader runner --maxWorkers=1');
    expect(gate).toContain('--configLoader runner');
  });
});
