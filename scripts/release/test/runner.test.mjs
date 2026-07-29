import { describe, expect, test } from "bun:test";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
  writeJson,
} from "./release-testkit.mjs";

const repo = resolve(import.meta.dir, "../../..");
const materializeScript = resolve(repo, "scripts/release/materialize-planned-tree.mjs");

function git(fixtureRepo, arguments_) {
  const result = run(fixtureRepo, ["git", ...arguments_]);
  if (result.exitCode !== 0) throw new TypeError(result.stderr.toString().trim());
  return result.stdout.toString();
}

function commitFixture(fixtureRepo) {
  git(fixtureRepo, ["init", "--quiet"]);
  git(fixtureRepo, ["add", "."]);
  git(fixtureRepo, [
    "-c",
    "user.name=Somewhere Test",
    "-c",
    "user.email=test@somewhere.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  return {
    repo: fixtureRepo,
    sha: git(fixtureRepo, ["rev-parse", "HEAD"]).trim(),
    tree: git(fixtureRepo, ["rev-parse", "HEAD^{tree}"]).trim(),
    status: git(fixtureRepo, ["status", "--porcelain=v1"]),
  };
}

async function createMaterializationFixture(root) {
  const fixtureRepo = resolve(root, "repository");
  await mkdir(fixtureRepo, { recursive: true });
  await writeJson(resolve(fixtureRepo, "package.json"), {
    name: "@somewhere/materialization-fixture",
    private: true,
  });
  await writeFile(resolve(fixtureRepo, "content.txt"), "committed fixture content\n");
  return commitFixture(fixtureRepo);
}

describe("Bound reviewer environment", () => {
  test("derives reviewer HOME from CODEX_HOME without leaking Cloudflare credentials", async () => {
    const root = await temporaryDirectory("bound-review-home");
    try {
      const fixtureRepo = resolve(root, "repository");
      await mkdir(fixtureRepo, { recursive: true });
      await writeFile(resolve(fixtureRepo, "source.txt"), "review fixture\n");
      const fixture = commitFixture(fixtureRepo);
      const fakeBin = resolve(root, "bin");
      const codexHome = resolve(root, "reviewer-home", ".codex2");
      const homeCapture = resolve(root, "reviewer-home.txt");
      await mkdir(fakeBin, { recursive: true });
      const fakeCodex = resolve(fakeBin, "codex2");
      await writeFile(fakeCodex, `#!/usr/bin/env bash
set -euo pipefail
printf '%s' "$HOME" > "$FAKE_HOME_CAPTURE"
test -z "\${CLOUDFLARE_API_TOKEN:-}"
if test "\${1:-}" = "--version"; then
  printf '%s\\n' 'codex-cli 0.145.0'
  exit 0
fi
response=""
while test "$#" -gt 0; do
  if test "$1" = "--output-last-message"; then
    shift
    response="\${1:?missing response path}"
  fi
  shift
done
test -n "$response"
printf '%s\\n' '{"verdict":"APPROVE","findings":[]}' > "$response"
`);
      await chmod(fakeCodex, 0o755);
      const schema = resolve(root, "response.schema.json");
      await writeJson(schema, { type: "object" });
      const profile = resolve(root, "profile.json");
      await writeJson(profile, {
        schemaVersion: 1,
        id: "fixture-review",
        instructions: "Review the bound fixture.",
        runner: {
          binary: "codex2",
          version: "codex-cli 0.145.0",
          model: "fixture-model",
          sandbox: "read-only",
          ephemeral: true,
        },
        outputSchema: schema,
      });
      const input = resolve(root, "input.json");
      await writeJson(input, { gate: "PASS" });
      const output = resolve(root, "review.json");
      const result = run(fixture.repo, [
        "env",
        "-u",
        "HOME",
        `CODEX_HOME=${codexHome}`,
        `PATH=${fakeBin}:${process.env.PATH}`,
        `FAKE_HOME_CAPTURE=${homeCapture}`,
        "CLOUDFLARE_API_TOKEN=must-not-reach-reviewer",
        "bun",
        resolve(repo, "scripts/release/run-bound-review.mjs"),
        "--profile",
        profile,
        "--sha",
        fixture.sha,
        "--source-tree",
        fixture.tree,
        "--inputs",
        input,
        "--output",
        output,
      ]);
      expect(result.exitCode).toBe(0);
      expect(await readFile(homeCapture, "utf8")).toBe(dirname(codexHome));
      expect(await readJson(output)).toMatchObject({
        verdict: "APPROVE",
        reviewedSha: fixture.sha,
        sourceTree: fixture.tree,
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});

describe("Prepared Worker launcher", () => {
  test("fails before allocation when the requested port is already occupied", async () => {
    const root = await temporaryDirectory("occupied-service");
    const server = createServer();
    await new Promise((complete, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", complete);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new TypeError("test server did not bind TCP");
      const output = resolve(root, "receipt.json");
      const result = run(repo, [
        "bun",
        "scripts/release/start-final-lane-service.mjs",
        "--repo",
        repo,
        "--asset-dir",
        resolve(root, "assets"),
        "--state-dir",
        resolve(root, "state"),
        "--runtime-dir",
        resolve(root, "runtime"),
        "--host",
        "127.0.0.1",
        "--port",
        String(address.port),
        "--output",
        output,
      ]);
      expect(result.exitCode).not.toBe(0);
      expect((await readJson(output))).toEqual({
        schemaVersion: 1,
        gate: "FAIL",
        reason: `port already in use: 127.0.0.1:${address.port}`,
      });
      await expect(access(resolve(root, "runtime"))).rejects.toBeDefined();
      await expect(access(resolve(root, "state"))).rejects.toBeDefined();
    } finally {
      await new Promise((complete, reject) => {
        server.close((error) => error === undefined ? complete() : reject(error));
      });
      await removeTemporaryDirectory(root);
    }
  });
});

describe("Final lane lifecycle", () => {
  for (const [signal, expectedExit] of [["HUP", 129], ["INT", 130], ["TERM", 143]]) {
    test(`removes allocated state before terminating on SIG${signal}`, async () => {
      const root = await temporaryDirectory(`signal-${signal.toLowerCase()}`);
      try {
        const output = resolve(root, "receipt.json");
        const result = run(repo, [
          "bun",
          "scripts/release/run-final-lane.mjs",
          "--signal-probe",
          signal,
          "--probe-output",
          output,
        ]);
        expect(result.exitCode).toBe(expectedExit);
        const receipt = await readJson(output);
        expect(receipt).toMatchObject({
          schemaVersion: 1,
          signal,
          exitCode: expectedExit,
          tempRemoved: true,
          handlerTerminated: true,
        });
        expect(typeof receipt.tempRoot).toBe("string");
        await expect(access(receipt.tempRoot)).rejects.toBeDefined();
      } finally {
        await removeTemporaryDirectory(root);
      }
    });
  }

  test("emits complete failure artifacts after an allocated-resource failure", async () => {
    const root = await temporaryDirectory("lane-failure");
    try {
      const fixtureRepo = resolve(root, "repository");
      const commands = resolve(fixtureRepo, "scripts/release/final-lane-commands-v1.json");
      await writeJson(commands, { schemaVersion: 1, lanes: { F1: [] } });
      const fixture = commitFixture(fixtureRepo);
      const evidenceRoot = resolve(root, "evidence");
      const finalRoot = resolve(evidenceRoot, "final", fixture.sha);
      const laneRoot = resolve(finalRoot, "F1");
      const preparation = resolve(root, "preparation.json");
      await writeJson(preparation, {
        preparationGate: "PASS",
        finalSha: fixture.sha,
        sourceTree: fixture.tree,
      });
      const output = resolve(laneRoot, "lane-verdict.json");
      const harness = resolve(laneRoot, "harness-command.json");
      const result = run(repo, [
        "bun",
        "scripts/release/run-final-lane.mjs",
        "--lane",
        "F1",
        "--repo",
        fixture.repo,
        "--preparation",
        preparation,
        "--commands",
        commands,
        "--evidence-root",
        evidenceRoot,
        "--final-root",
        finalRoot,
        "--harness-receipt",
        harness,
        "--output",
        output,
        "--failure-probe",
        "after-allocation",
      ]);
      expect(result.exitCode).not.toBe(0);
      const cleanup = await readJson(resolve(laneRoot, "cleanup.txt"));
      expect(cleanup).toMatchObject({
        schemaVersion: 1,
        gate: "PASS",
        portClosed: true,
        tempRootRemoved: true,
      });
      expect(typeof cleanup.tempRoot).toBe("string");
      await expect(access(cleanup.tempRoot)).rejects.toBeDefined();
      expect(await readJson(resolve(laneRoot, "checks.json"))).toMatchObject({
        schemaVersion: 1,
        gate: "FAIL",
        lane: "F1",
      });
      expect(await readJson(output)).toMatchObject({
        schemaVersion: 1,
        gate: "FAIL",
        lane: "F1",
        finalSha: fixture.sha,
        sourceTree: fixture.tree,
        reason: "failure probe after allocation",
      });
      expect(await readJson(harness)).toMatchObject({
        schemaVersion: 1,
        gate: "FAIL",
        lane: "F1",
        finalSha: fixture.sha,
        sourceTree: fixture.tree,
        reason: "failure probe after allocation",
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});

describe("Exact tree materialization", () => {
  test("materializes the named Git tree outside the repository without touching source state", async () => {
    const root = await temporaryDirectory("materialize");
    try {
      const fixture = await createMaterializationFixture(root);
      const destination = resolve(root, "tree");
      const receipt = resolve(root, "receipt.json");
      const result = run(repo, [
        "bun",
        materializeScript,
        "--repo",
        fixture.repo,
        "--tree",
        fixture.tree,
        "--destination",
        destination,
        "--receipt",
        receipt,
      ]);
      expect(result.exitCode).toBe(0);
      expect((await readJson(receipt))).toMatchObject({
        schemaVersion: 1,
        gate: "PASS",
        sourceTree: fixture.tree,
        destination,
      });
      expect(await readJson(resolve(destination, "package.json"))).toEqual({
        name: "@somewhere/materialization-fixture",
        private: true,
      });
      expect(await readFile(resolve(destination, "content.txt"), "utf8")).toBe(
        "committed fixture content\n",
      );
      expect(git(fixture.repo, ["status", "--porcelain=v1"])).toBe(fixture.status);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a destination inside the repository", async () => {
    const root = await temporaryDirectory("materialize-reject");
    try {
      const fixture = await createMaterializationFixture(root);
      const destination = resolve(fixture.repo, ".forbidden-release-tree");
      const result = run(repo, [
        "bun",
        materializeScript,
        "--repo",
        fixture.repo,
        "--tree",
        fixture.tree,
        "--destination",
        destination,
        "--receipt",
        resolve(root, "receipt.json"),
      ]);
      expect(result.exitCode).not.toBe(0);
      await expect(access(destination)).rejects.toBeDefined();
      expect(git(fixture.repo, ["status", "--porcelain=v1"])).toBe(fixture.status);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});

describe("Final cleanup verifier", () => {
  test("accepts only structured clean lane receipts and actually closed ports", async () => {
    const root = await temporaryDirectory("final-cleanup");
    try {
      for (const lane of ["F1", "F2", "F3", "F4"]) {
        await writeJson(resolve(root, lane, "cleanup.txt"), {
          schemaVersion: 1,
          gate: "PASS",
          pid: null,
          portClosed: true,
          browserContextCount: 0,
          tempRoot: null,
          tempRootRemoved: true,
        });
      }
      const output = resolve(root, "cleanup.json");
      const result = run(repo, [
        "bun",
        "scripts/release/verify-final-cleanup.mjs",
        "--evidence-root",
        root,
        "--require-lanes",
        "F1,F2,F3,F4",
        "--require-ports-closed",
        "38787,38788",
        "--require-zero-browser-contexts",
        "--require-zero-temp-roots",
        "--output",
        output,
      ]);
      expect(result.exitCode).toBe(0);
      expect((await readJson(output))).toMatchObject({
        schemaVersion: 1,
        gate: "PASS",
        serverCount: 0,
        browserContextCount: 0,
        openPorts: [],
        tempRoots: [],
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
