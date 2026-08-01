import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { repo, writeFakeWrangler } from "./ci-staging.fixture.mjs";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
  writeJson,
} from "./release-testkit.mjs";

describe("Todo 20 CI and staging gates", () => {
  test("resolves the acceptance root from its checked-out script location", async () => {
    const script = resolve(repo, "scripts/release/cloudflare-acceptance-gates.sh");
    const scriptText = await Bun.file(script).text();
    const result = run("/tmp", [
      "env", "-u", "SOMEWHERE_ROOT", "bash", script, "config-contract",
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
    const root = await temporaryDirectory("workflow-verdict");
    try {
      const output = resolve(root, "workflow.json");
      const result = run(repo, [
        "bun", "scripts/release/validate-workflows.mjs", "--ci", ".github/workflows/v2-ci.yml",
        "--staging", ".github/workflows/v2-staging.yml", "--wrangler", "server/wrangler.jsonc",
        "--output", output,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toBe("PASS: workflow safety validated\n");
      expect(await readJson(output)).toMatchObject({
        gate: "PASS", schemaValid: true, pullRequestSecretsExposed: false,
        stagingEnvironmentProtected: true, externalProtectionVerified: false,
        externalWriteInLocalMode: false, lifecycleGradualRollbackAllowed: false,
        historicalPagesFrozen: true,
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a V2 CI workflow that verifies the browser app without installing browsers", async () => {
    const root = await temporaryDirectory("ci-browser-install");
    try {
      const original = await readFile(resolve(repo, ".github/workflows/v2-ci.yml"), "utf8");
      const installStep = [
        "      - name: Install Playwright browsers",
        "        working-directory: app",
        "        run: bunx --no-install playwright install --with-deps chromium webkit",
        "",
      ].join("\n");
      const workflows = resolve(root, ".github/workflows");
      await mkdir(workflows, { recursive: true });
      const ci = resolve(workflows, "v2-ci.yml");
      await writeFile(ci, original.replace(installStep, ""));
      await writeFile(
        resolve(workflows, "app.yml"),
        await readFile(resolve(repo, ".github/workflows/app.yml"), "utf8"),
      );
      const result = run(repo, [
        "bun", "scripts/release/validate-workflows.mjs",
        "--ci", ci,
        "--staging", ".github/workflows/v2-staging.yml",
        "--wrangler", "server/wrangler.jsonc",
        "--output", resolve(root, "workflow.json"),
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain("CI_GATE_MISSING:playwright install --with-deps chromium webkit");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects staging workflows with any repository-seal binding removed", async () => {
    const root = await temporaryDirectory("staging-seal-mutations");
    try {
      const original = await readFile(resolve(repo, ".github/workflows/v2-staging.yml"), "utf8");
      const mutations = [
        ["verify-staging-seal.mjs", "verify-staging-seal-missing.mjs"],
        ["vars.STAGING_REPOSITORY_VERDICT_SHA256", "inputs.repository_verdict_sha256"],
        ["terminal_manifest_b64:", "terminal_manifest_payload_b64:"],
        ["repository_verdict_b64:", "repository_verdict_payload_b64:"],
        ["validate-https-origin.mjs", "validate-https-origin-missing.mjs"],
      ];
      for (const [index, [needle, replacement]] of mutations.entries()) {
        expect(original).toContain(needle);
        const staging = resolve(root, `${index}.yml`);
        await writeFile(staging, original.replace(needle, replacement));
        const result = run(repo, [
          "bun", "scripts/release/validate-workflows.mjs",
          "--ci", ".github/workflows/v2-ci.yml",
          "--staging", staging,
          "--wrangler", "server/wrangler.jsonc",
          "--output", resolve(root, "workflow.json"),
        ]);
        expect(result.exitCode).not.toBe(0);
      }
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("aborts the staging release before deploy when CANONICAL_ORIGIN is absent", async () => {
    const root = await temporaryDirectory("deployment-secret-check");
    try {
      const deployMarker = resolve(root, "deploy-called");
      const callLog = resolve(root, "wrangler-calls");
      await writeFakeWrangler(root);
      const result = run(repo, [
        "bash", "-c", [
          "bash scripts/release/cloudflare-acceptance-gates.sh",
          "deployment-secret-check staging",
          '&& "$FAKE_WRANGLER" deploy --env staging',
        ].join(" "),
      ], {
        SOMEWHERE_ROOT: root,
        FAKE_WRANGLER_CALL_LOG: callLog,
        FAKE_DEPLOY_MARKER: deployMarker,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("required remote Worker secret missing: CANONICAL_ORIGIN");
      expect(await Bun.file(deployMarker).exists()).toBe(false);
      expect(await readFile(callLog, "utf8")).toContain("secret list --config");

      const present = run(repo, [
        "bash", "scripts/release/cloudflare-acceptance-gates.sh", "deployment-secret-check", "staging",
      ], {
        SOMEWHERE_ROOT: root,
        FAKE_WRANGLER_CALL_LOG: callLog,
        FAKE_DEPLOY_MARKER: deployMarker,
        FAKE_SECRET_LIST: JSON.stringify([{ name: "CANONICAL_ORIGIN", type: "secret_text" }]),
      });
      expect(present.exitCode, present.stderr.toString()).toBe(0);
      expect(present.stdout.toString()).toContain("PASS: staging remote Worker secret exists: CANONICAL_ORIGIN");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("places the authoritative secret check immediately before staging deploy", async () => {
    const workflow = await readFile(resolve(repo, ".github/workflows/v2-staging.yml"), "utf8");
    const secretCheck = workflow.indexOf("deployment-secret-check staging");
    const deploy = workflow.indexOf("node_modules/.bin/wrangler deploy");

    expect(secretCheck).toBeGreaterThan(0);
    expect(deploy).toBeGreaterThan(secretCheck);
  });
});
