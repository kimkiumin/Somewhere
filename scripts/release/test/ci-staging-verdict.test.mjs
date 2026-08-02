import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  repo,
  unsafeFixtures,
  writePassingWorkflowVerdict,
} from "./ci-staging.fixture.mjs";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
} from "./release-testkit.mjs";

describe("Todo 20 CI and staging verdicts", () => {
  test("reports repository PASS and release BLOCK when external authorities are absent", async () => {
    const root = await temporaryDirectory("ci-verdict");
    try {
      const workflow = resolve(root, "workflow.json");
      const workflowResult = run(repo, [
        "bun", "scripts/release/validate-workflows.mjs", "--ci", ".github/workflows/v2-ci.yml",
        "--staging", ".github/workflows/v2-staging.yml", "--wrangler", "server/wrangler.jsonc",
        "--output", workflow,
      ]);
      expect(workflowResult.exitCode).toBe(0);
      const output = resolve(root, "release.json");
      const result = run(repo, [
        "bun", "scripts/release/validate-ci-verdict.mjs", "--mode", "repository",
        "--source-tree", "a".repeat(40),
        "--fixture", "scripts/release/fixtures/ci/repository-ready-release-blocked.json",
        "--workflow-verdict", workflow, "--expect-repository", "PASS", "--expect-release", "BLOCK",
        "--output", output,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toBe("PASS: repository ready; release blocked by external gates\n");
      expect(await readJson(output)).toMatchObject({
        repositoryReady: "PASS", releaseReady: "BLOCK", externalWrites: 0,
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test.each(unsafeFixtures)("fails closed for %s", async (fixture, failureCode) => {
    const root = await temporaryDirectory("ci-unsafe");
    try {
      const workflow = resolve(root, "workflow.json");
      await writePassingWorkflowVerdict(workflow);
      const output = resolve(root, `${fixture}.json`);
      const result = run(repo, [
        "bun", "scripts/release/validate-ci-verdict.mjs", "--mode", "repository",
        "--source-tree", "a".repeat(40), "--fixture", `scripts/release/fixtures/ci/${fixture}.json`,
        "--workflow-verdict", workflow, "--expect-repository", "PASS", "--expect-release", "BLOCK",
        "--output", output,
      ]);

      expect(result.exitCode).toBe(1);
      expect(await readJson(output)).toMatchObject({ repositoryReady: "FAIL", externalWrites: 0 });
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
    const root = await temporaryDirectory("ci-cleanup");
    try {
      const receipt = resolve(root, `${signal}.json`);
      const result = run(repo, [
        "bash", "scripts/release/test-ci-cleanup-trap.sh", "--signal", signal, "--receipt", receipt,
      ]);

      expect(result.exitCode).toBe(exitCode);
      expect(await readJson(receipt)).toMatchObject({
        signal, tempRemoved: true, handlerTerminated: true, processGroupTerminated: true, waited: true,
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
