import { describe, expect, test } from "bun:test";
import { access, chmod, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
  writeJson,
} from "./release-testkit.mjs";
import {
  createLaneLifecycle,
  stopOwnedProcessGroup,
} from "../lib/lane-lifecycle.mjs";

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

async function createLaneFailureFixture(root) {
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
  return {
    commands,
    evidenceRoot,
    finalRoot,
    fixture,
    harness: resolve(laneRoot, "harness-command.json"),
    laneRoot,
    output: resolve(laneRoot, "lane-verdict.json"),
    preparation,
  };
}

function runLaneFailureProbe(lane, failureProbe) {
  return run(repo, [
    "bun",
    "scripts/release/run-final-lane.mjs",
    "--lane",
    "F1",
    "--repo",
    lane.fixture.repo,
    "--preparation",
    lane.preparation,
    "--commands",
    lane.commands,
    "--evidence-root",
    lane.evidenceRoot,
    "--final-root",
    lane.finalRoot,
    "--harness-receipt",
    lane.harness,
    "--output",
    lane.output,
    "--failure-probe",
    failureProbe,
  ]);
}

async function createWorkerAcquisitionFixture(
  root,
  delayMilliseconds = 0,
  hangBeforeReceipt = false,
  hangBeforeOwnership = false,
  exitBeforeOwnership = false,
) {
  const fixtureRepo = resolve(root, "repository");
  const release = resolve(fixtureRepo, "scripts/release");
  await cp(resolve(repo, "scripts/release"), release, { recursive: true });
  await writeFile(resolve(fixtureRepo, "dirty-target.txt"), "clean\n");
  await writeFile(resolve(release, "launch-worker-and-dirty.mjs"), `import { spawn } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const options = Object.fromEntries(
  process.argv.slice(2).reduce((entries, value, index, argv) => {
    if (index % 2 === 0) entries.push([value.slice(2), argv[index + 1]]);
    return entries;
  }, []),
);
async function writeJson(path, value) {
  const temporary = \`\${path}.tmp-\${process.pid}\`;
  await writeFile(temporary, JSON.stringify(value));
  await rename(temporary, path);
}
const child = options["hang-before-ownership"] === "true" || options["exit-before-ownership"] === "true"
  ? spawn("bash", ["-c", "trap '' TERM; sleep 300 & wait"], { detached: false, stdio: "ignore" })
  : spawn("sleep", ["300"], { detached: false, stdio: "ignore" });
const processStat = readFileSync(\`/proc/\${child.pid}/stat\`, "utf8");
const processFields = processStat.slice(processStat.lastIndexOf(")") + 2).split(" ");
const processStartTime = processFields[19];
const processGroupId = Number(process.env.SOMEWHERE_ACQUISITION_PROCESS_GROUP_ID);
child.unref();
await writeJson(options.marker, {
  pid: child.pid,
  processGroupId,
  tempRoot: options["temp-root"],
});
await mkdir(options["marker-dir"], { recursive: true });
await writeJson(resolve(options["marker-dir"], \`\${child.pid}.json\`), {
  pid: child.pid,
  processGroupId,
  tempRoot: options["temp-root"],
});
if (options["exit-before-ownership"] === "true") process.exit(1);
if (options["hang-before-ownership"] === "true") await new Promise(() => {});
const ownershipTemporary = \`\${options["ownership-output"]}.tmp-\${process.pid}\`;
writeFileSync(ownershipTemporary, JSON.stringify({
  schemaVersion: 1,
  pid: child.pid,
  processGroupId,
  processStartTime,
  port: null,
}));
renameSync(ownershipTemporary, options["ownership-output"]);
if (options.hang === "true") await new Promise(() => {});
await Bun.sleep(Number(options.delay));
await writeJson(options.output, {
  schemaVersion: 1,
  gate: "PASS",
  pid: child.pid,
  processGroupId,
  processStartTime,
  port: 8788,
});
await writeFile(options.dirty, "dirty\\n");
`);
  await writeJson(resolve(release, "final-lane-commands-v1.json"), {
    schemaVersion: 1,
    lanes: {
      F1: [{
        id: "prepare-health",
        classification: "repository",
        primary: "${FINAL_ROOT}/F1/prepare-health.json",
        argv: [
          "bun",
          "scripts/release/launch-worker-and-dirty.mjs",
          "--output",
          "${FINAL_ROOT}/F1/prepare-health.json",
          "--marker",
          "${FINAL_ROOT}/F1/worker-marker.json",
          "--marker-dir",
          "${FINAL_ROOT}/F1/worker-markers",
          "--temp-root",
          "${TEMP_ROOT}",
          "--delay",
          String(delayMilliseconds),
          "--hang",
          String(hangBeforeReceipt),
          "--hang-before-ownership",
          String(hangBeforeOwnership),
          "--exit-before-ownership",
          String(exitBeforeOwnership),
          "--dirty",
          "${REPO}/dirty-target.txt",
        ],
      }],
    },
  });
  await writeJson(resolve(release, "final-lane-checks-v1.json"), {
    schemaVersion: 1,
    lanes: { F1: ["prepare-health"] },
  });
  const fixture = commitFixture(fixtureRepo);
  const evidenceRoot = resolve(root, "evidence");
  const finalRoot = resolve(evidenceRoot, "final", fixture.sha);
  const laneRoot = resolve(finalRoot, "F1");
  const preparation = resolve(root, "preparation.json");
  await writeJson(preparation, {
    preparationGate: "PASS",
    finalSha: fixture.sha,
    sourceTree: fixture.tree,
    reviewedPlan: { path: "plan.md", sha256: `sha256:${"a".repeat(64)}` },
    policy: { kind: "calibration", path: "policy.json", sha256: `sha256:${"b".repeat(64)}` },
    buildReceipt: { path: "build-receipt.json" },
    buildArchive: { path: "build.tar.gz" },
    preparationManifest: { path: "preparation-manifest.sha256" },
    rcPromotionReceipt: { path: "rc-promotion-receipt.json" },
  });
  const primary = resolve(laneRoot, "prepare-health.json");
  const harness = resolve(laneRoot, "harness-command.json");
  const output = resolve(laneRoot, "lane-verdict.json");
  return {
    argv: [
      "bun",
      "scripts/release/run-final-lane.mjs",
      "--lane",
      "F1",
      "--repo",
      fixture.repo,
      "--preparation",
      preparation,
      "--commands",
      resolve(release, "final-lane-commands-v1.json"),
      "--evidence-root",
      evidenceRoot,
      "--final-root",
      finalRoot,
      "--harness-receipt",
      harness,
      "--output",
      output,
    ],
    harness,
    laneRoot,
    marker: resolve(laneRoot, "worker-marker.json"),
    markerDirectory: resolve(laneRoot, "worker-markers"),
    output,
    primary,
  };
}

async function waitForJson(path) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      return await readJson(path);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      await Bun.sleep(10);
    }
  }
  throw new TypeError(`timed out waiting for JSON: ${path}`);
}

async function readAcquisitionReceipt(laneRoot) {
  const names = (await readdir(laneRoot))
    .filter((name) => name.startsWith("prepare-health-acquisition-") && name.endsWith(".json"));
  expect(names).toHaveLength(1);
  return readJson(resolve(laneRoot, names[0]));
}

function processGroupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("Bound reviewer environment", () => {
  test("derives reviewer HOME from CODEX_HOME without leaking ambient credentials", async () => {
    const root = await temporaryDirectory("bound-review-home");
    try {
      const fixtureRepo = resolve(root, "repository");
      await mkdir(fixtureRepo, { recursive: true });
      await writeFile(resolve(fixtureRepo, "source.txt"), "review fixture\n");
      const fixture = commitFixture(fixtureRepo);
      const fakeBin = resolve(root, "bin");
      const codexHome = resolve(root, "reviewer-home", ".codex2");
      const ambientHome = resolve(root, "ambient-home");
      const homeCapture = resolve(root, "reviewer-home.txt");
      const snapshotCapture = resolve(root, "reviewer-snapshot.txt");
      await mkdir(fakeBin, { recursive: true });
      const fakeCodex = resolve(fakeBin, "codex2");
      await writeFile(fakeCodex, `#!/usr/bin/env bash
set -euo pipefail
printf '%s' "$HOME" > ${JSON.stringify(homeCapture)}
test -z "\${CLOUDFLARE_API_TOKEN:-}"
test -z "\${OPENAI_API_KEY:-}"
test -z "\${GITHUB_TOKEN:-}"
test -z "\${SSH_AUTH_SOCK:-}"
if test "\${1:-}" = "--version"; then
  printf '%s\\n' 'codex-cli 0.146.0'
  exit 0
fi
response=""
prompt=""
while test "$#" -gt 0; do
  prompt="$1"
  if test "$1" = "--output-last-message"; then
    shift
    response="\${1:?missing response path}"
  fi
  shift
done
test -n "$response"
printf '%s\\n' '{"gate":"MUTATED"}' > ${JSON.stringify(resolve(root, "input.json"))}
snapshot="$(printf '%s\\n' "$prompt" | sed -n 's/.* snapshot=\\([^ ]*\\) sha256:.*/\\1/p' | head -n 1)"
test -n "$snapshot"
cat "$snapshot" > ${JSON.stringify(snapshotCapture)}
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
          version: "codex-cli 0.146.0",
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
        `HOME=${ambientHome}`,
        `CODEX_HOME=${codexHome}`,
        `PATH=${fakeBin}:${process.env.PATH}`,
        "CLOUDFLARE_API_TOKEN=must-not-reach-reviewer",
        "OPENAI_API_KEY=must-not-reach-reviewer",
        "GITHUB_TOKEN=must-not-reach-reviewer",
        "SSH_AUTH_SOCK=/tmp/must-not-reach-reviewer.sock",
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
      expect(await readFile(snapshotCapture, "utf8")).toBe('{\n  "gate": "PASS"\n}\n');
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
  test("does not signal a reused lane-lease holder process group", async () => {
    let identityReads = 0;
    const signals = [];
    const stopped = stopOwnedProcessGroup({
      pid: Number.MAX_SAFE_INTEGER,
      startTime: "101",
      exited: new Promise(() => {}),
      hasExited: () => false,
    }, {
      killProcess(_pid, signal) {
        signals.push(signal);
      },
      pause: async () => {},
      async processStartTime() {
        identityReads += 1;
        return identityReads === 1 ? "101" : "202";
      },
    });

    await expect(stopped).rejects.toThrow("process group owner identity changed before SIGKILL");
    expect(signals.filter((signal) => signal !== 0)).toEqual(["SIGTERM"]);
    expect(identityReads).toBe(2);
  });

  test("does not signal a lane-lease holder after its child exit settles", async () => {
    let holderExited = false;
    const signals = [];
    await stopOwnedProcessGroup({
      pid: Number.MAX_SAFE_INTEGER,
      startTime: "101",
      exited: Promise.resolve(),
      hasExited: () => holderExited,
    }, {
      killProcess(_pid, signal) {
        if (signal === 0) {
          const error = new Error("lane lease holder group exited");
          error.code = "ESRCH";
          throw error;
        }
        signals.push(signal);
      },
      async processStartTime() {
        holderExited = true;
        return "101";
      },
    });

    expect(signals).toEqual([]);
  });

  test("does not escalate after the acquisition leader identity ends", async () => {
    let leaderExited = false;
    const signals = [];
    const stopped = stopOwnedProcessGroup({
      pid: Number.MAX_SAFE_INTEGER,
      startTime: "101",
      exited: Promise.resolve(),
      hasExited: () => leaderExited,
    }, {
      killProcess(_pid, signal) {
        signals.push(signal);
        if (signal === "SIGTERM") leaderExited = true;
      },
      pause: async () => {},
      async processStartTime() {
        return leaderExited ? null : "101";
      },
    });

    await expect(stopped).rejects.toThrow("process group owner identity changed before SIGKILL");
    expect(signals.filter((signal) => signal !== 0)).toEqual(["SIGTERM"]);
  });

  test("records worker termination errors without rejecting cached cleanup", async () => {
    const lifecycle = createLaneLifecycle({
      killProcess() {
        const error = new Error("worker termination denied");
        error.code = "EPERM";
        throw error;
      },
      async processStartTime() {
        return "1";
      },
    });
    const temporaryRoot = await lifecycle.allocate("/tmp/somewhere-worker-cleanup.");
    try {
      lifecycle.ownWorker(Number.MAX_SAFE_INTEGER, "1");

      const first = await lifecycle.cleanup();
      const cached = await lifecycle.cleanup();

      expect(first).toEqual(cached);
      expect(first).toMatchObject({
        pid: Number.MAX_SAFE_INTEGER,
        workerStopped: false,
        tempRoot: temporaryRoot,
        tempRootRemoved: false,
        cleanupFailures: [
          {
            phase: "worker-termination",
            reason: "worker termination denied",
          },
        ],
      });
      await access(temporaryRoot);
    } finally {
      await removeTemporaryDirectory(temporaryRoot);
    }
  });

  test("waits for process-group exit after escalating to SIGKILL", async () => {
    let killed = false;
    let postKillProbes = 0;
    const lifecycle = createLaneLifecycle({
      killProcess(_pid, signal) {
        if (signal === "SIGKILL") {
          killed = true;
          return;
        }
        if (signal === 0 && killed) {
          postKillProbes += 1;
          if (postKillProbes === 2) {
            const error = new Error("process group exited");
            error.code = "ESRCH";
            throw error;
          }
        }
      },
      pause: async () => {},
      async processStartTime() {
        return "1";
      },
      async removeTemporaryRoot(path, options) {
        if (postKillProbes < 2) {
          const error = new Error("worker still owns temporary state");
          error.code = "EBUSY";
          throw error;
        }
        await rm(path, options);
      },
    });
    const temporaryRoot = await lifecycle.allocate("/tmp/somewhere-worker-kill.");
    try {
      lifecycle.ownWorker(Number.MAX_SAFE_INTEGER, "1");

      const cleanup = await lifecycle.cleanup();

      expect(cleanup).toMatchObject({
        workerStopped: true,
        tempRootRemoved: true,
        cleanupFailures: [],
      });
      await expect(access(temporaryRoot)).rejects.toBeDefined();
    } finally {
      await removeTemporaryDirectory(temporaryRoot);
    }
  });

  test("retains temporary state when the worker identity ended but its group remains", async () => {
    const signals = [];
    const lifecycle = createLaneLifecycle({
      killProcess(pid, signal) {
        if (signal !== 0) signals.push({ pid, signal });
      },
      pause: async () => {},
      async processStartTime() {
        return "202";
      },
    });
    const temporaryRoot = await lifecycle.allocate("/tmp/somewhere-worker-identity.");
    try {
      lifecycle.ownWorker(Number.MAX_SAFE_INTEGER, "101", Number.MAX_SAFE_INTEGER - 1);

      const cleanup = await lifecycle.cleanup();

      expect(signals).toEqual([]);
      expect(cleanup).toMatchObject({
        pid: Number.MAX_SAFE_INTEGER,
        processStartTime: "101",
        workerStopped: false,
        tempRootRemoved: false,
        cleanupFailures: [{
          phase: "worker-identity-verification",
          reason: `worker identity unavailable while owned process group remains: ${Number.MAX_SAFE_INTEGER - 1}`,
        }],
      });
      await access(temporaryRoot);
    } finally {
      await removeTemporaryDirectory(temporaryRoot);
    }
  });

  test("retains state instead of escalating after the worker identity ends", async () => {
    const workerPid = Number.MAX_SAFE_INTEGER;
    const processGroupId = workerPid - 1;
    let workerExited = false;
    let identityReads = 0;
    const signals = [];
    const lifecycle = createLaneLifecycle({
      killProcess(pid, signal) {
        signals.push({ pid, signal });
        if (signal === "SIGTERM") workerExited = true;
      },
      pause: async () => {},
      async processStartTime() {
        identityReads += 1;
        return workerExited ? null : "101";
      },
    });
    const temporaryRoot = await lifecycle.allocate("/tmp/somewhere-worker-descendant.");
    try {
      lifecycle.ownWorker(workerPid, "101", processGroupId);

      const cleanup = await lifecycle.cleanup();

      expect(signals.some((entry) => entry.signal === "SIGKILL")).toBe(false);
      expect(identityReads).toBe(2);
      expect(cleanup).toMatchObject({
        workerStopped: false,
        tempRootRemoved: false,
        cleanupFailures: [{
          phase: "worker-identity-verification",
          reason: `worker identity changed before SIGKILL: ${workerPid}`,
        }],
      });
      await access(temporaryRoot);
    } finally {
      await removeTemporaryDirectory(temporaryRoot);
    }
  });

  test("does not escalate after the worker PID identity is reused", async () => {
    const workerPid = Number.MAX_SAFE_INTEGER;
    const processGroupId = workerPid - 1;
    let identityReads = 0;
    const signals = [];
    const lifecycle = createLaneLifecycle({
      killProcess(pid, signal) {
        if (signal !== 0) signals.push({ pid, signal });
      },
      pause: async () => {},
      async processStartTime() {
        identityReads += 1;
        return identityReads === 1 ? "101" : "202";
      },
    });
    const temporaryRoot = await lifecycle.allocate("/tmp/somewhere-worker-reused.");
    try {
      lifecycle.ownWorker(workerPid, "101", processGroupId);

      const cleanup = await lifecycle.cleanup();

      expect(signals).toEqual([{ pid: -processGroupId, signal: "SIGTERM" }]);
      expect(identityReads).toBe(2);
      expect(cleanup).toMatchObject({
        workerStopped: false,
        tempRootRemoved: false,
        cleanupFailures: [{
          phase: "worker-identity-verification",
          reason: `worker identity changed before SIGKILL: ${workerPid}`,
        }],
      });
      await access(temporaryRoot);
    } finally {
      await removeTemporaryDirectory(temporaryRoot);
    }
  });

  test("fails closed when an owned-port probe is inconclusive", async () => {
    const lifecycle = createLaneLifecycle({
      async probePort() {
        const error = new Error("socket descriptor limit reached");
        error.code = "EMFILE";
        throw error;
      },
    });
    const temporaryRoot = await lifecycle.allocate("/tmp/somewhere-port-cleanup.");
    try {
      lifecycle.ownPort(8788);

      const cleanup = await lifecycle.cleanup();

      expect(cleanup).toMatchObject({
        portClosed: false,
        tempRootRemoved: true,
        cleanupFailures: [
          {
            phase: "owned-port-verification",
            reason: "socket descriptor limit reached",
          },
        ],
      });
    } finally {
      await removeTemporaryDirectory(temporaryRoot);
    }
  });

  test("bounds cleanup when prepare-health never produces an ownership receipt", async () => {
    let cancelled = 0;
    const lifecycle = createLaneLifecycle({
      acquisitionGraceMilliseconds: 0,
      acquisitionCancellationMilliseconds: 0,
    });
    const temporaryRoot = await lifecycle.allocate("/tmp/somewhere-acquisition-timeout.");
    try {
      lifecycle.beginAcquisition(async () => {
        cancelled += 1;
        await new Promise(() => {});
      });

      const cleanup = await lifecycle.cleanup();

      expect(cancelled).toBe(1);
      expect(cleanup).toMatchObject({
        workerStopped: false,
        tempRoot: temporaryRoot,
        tempRootRemoved: false,
        cleanupFailures: [{
          phase: "worker-acquisition",
          reason: "worker acquisition did not stop within 0ms",
        }],
      });
      await access(temporaryRoot);
    } finally {
      await removeTemporaryDirectory(temporaryRoot);
    }
  });

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

  test("records lease-release failure and still terminates with the signal exit code", async () => {
    const root = await temporaryDirectory("signal-lease-failure");
    try {
      const output = resolve(root, "receipt.json");
      const result = run(repo, [
        "bun",
        "scripts/release/run-final-lane.mjs",
        "--signal-probe",
        "TERM",
        "--probe-output",
        output,
        "--lease-release-failure",
        "true",
      ]);

      expect(result.exitCode).toBe(143);
      expect(await readJson(output)).toMatchObject({
        schemaVersion: 1,
        gate: "FAIL",
        signal: "TERM",
        exitCode: 143,
        tempRemoved: true,
        handlerTerminated: true,
        cleanupFailures: [{
          phase: "lane-lease-release",
          reason: "signal probe lease release failed",
        }],
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("fails the signal receipt when temp absence verification returns false", async () => {
    const root = await temporaryDirectory("signal-temp-verification");
    try {
      const output = resolve(root, "receipt.json");
      const lifecycleModule = resolve(repo, "scripts/release/lib/lane-lifecycle.mjs");
      const script = `import { createLaneLifecycle } from ${JSON.stringify(lifecycleModule)};
const lifecycle = createLaneLifecycle({ temporaryRootAbsent: async () => false });
lifecycle.setSignalOutput(${JSON.stringify(output)});
await lifecycle.allocate("/tmp/somewhere-signal-false.");
setTimeout(() => process.kill(process.pid, "SIGTERM"), 20);
await new Promise(() => {});
`;
      const result = run(repo, ["bun", "-e", script]);

      expect(result.exitCode).toBe(143);
      expect(await readJson(output)).toMatchObject({
        schemaVersion: 1,
        gate: "FAIL",
        signal: "TERM",
        exitCode: 143,
        tempRemoved: false,
        handlerTerminated: true,
        cleanupFailures: [],
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("emits complete failure artifacts after an allocated-resource failure", async () => {
    const root = await temporaryDirectory("lane-failure");
    try {
      const lane = await createLaneFailureFixture(root);
      const result = runLaneFailureProbe(lane, "after-allocation");
      expect(result.exitCode).not.toBe(0);
      const cleanup = await readJson(resolve(lane.laneRoot, "cleanup.txt"));
      expect(cleanup).toMatchObject({
        schemaVersion: 1,
        gate: "PASS",
        portClosed: true,
        tempRootRemoved: true,
      });
      expect(typeof cleanup.tempRoot).toBe("string");
      await expect(access(cleanup.tempRoot)).rejects.toBeDefined();
      expect(await readJson(resolve(lane.laneRoot, "checks.json"))).toMatchObject({
        schemaVersion: 1,
        gate: "FAIL",
        lane: "F1",
      });
      expect(await readJson(lane.output)).toMatchObject({
        schemaVersion: 1,
        gate: "FAIL",
        lane: "F1",
        finalSha: lane.fixture.sha,
        sourceTree: lane.fixture.tree,
        reason: "failure probe after allocation",
      });
      expect(await readJson(lane.harness)).toMatchObject({
        schemaVersion: 1,
        gate: "FAIL",
        lane: "F1",
        finalSha: lane.fixture.sha,
        sourceTree: lane.fixture.tree,
        reason: "failure probe after allocation",
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("preserves the original error when temporary-root deletion fails", async () => {
    const root = await temporaryDirectory("lane-cleanup-failure");
    let failedTemporaryRoot;
    try {
      const lane = await createLaneFailureFixture(root);
      const result = runLaneFailureProbe(lane, "after-allocation-with-delete-failure");

      expect(result.exitCode).not.toBe(0);
      const cleanup = await readJson(resolve(lane.laneRoot, "cleanup.txt"));
      failedTemporaryRoot = cleanup.tempRoot;
      expect(cleanup).toMatchObject({
        schemaVersion: 1,
        gate: "FAIL",
        portClosed: true,
        tempRootRemoved: false,
        cleanupFailures: [
          {
            phase: "temporary-root-removal",
          },
        ],
      });
      for (const artifact of [
        resolve(lane.laneRoot, "checks.json"),
        lane.output,
        lane.harness,
      ]) {
        expect(await readJson(artifact)).toMatchObject({
          gate: "FAIL",
          reason: "failure probe after allocation",
          cleanupFailures: cleanup.cleanupFailures,
        });
      }
    } finally {
      if (typeof failedTemporaryRoot === "string") {
        try {
          await chmod(resolve(failedTemporaryRoot, "locked"), 0o700);
        } catch {
          // The pre-fix implementation removes the temporary root successfully.
        }
        await removeTemporaryDirectory(failedTemporaryRoot);
      }
      await removeTemporaryDirectory(root);
    }
  });

  test("publishes no canonical PASS artifacts when lane-lease release fails", async () => {
    const root = await temporaryDirectory("lane-lease-release-failure");
    try {
      const lane = await createLaneFailureFixture(root);
      const result = runLaneFailureProbe(lane, "lane-lease-release");

      expect(result.exitCode).not.toBe(0);
      const cleanup = await readJson(resolve(lane.laneRoot, "cleanup.txt"));
      expect(cleanup).toMatchObject({
        schemaVersion: 1,
        gate: "FAIL",
        cleanupFailures: [{
          phase: "lane-lease-release",
          reason: "failure probe lane lease release",
        }],
      });
      for (const artifact of [
        resolve(lane.laneRoot, "checks.json"),
        lane.output,
        lane.harness,
      ]) {
        expect(await readJson(artifact)).toMatchObject({
          gate: "FAIL",
          reason: "lane lease release failed: failure probe lane lease release",
          cleanupFailures: cleanup.cleanupFailures,
        });
      }
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("does not treat another lane's port as a non-F3 cleanup failure", async () => {
    const root = await temporaryDirectory("lane-concurrency");
    const server = createServer();
    await new Promise((complete, reject) => {
      server.once("error", reject);
      server.listen(8788, "127.0.0.1", complete);
    });
    try {
      const lane = await createLaneFailureFixture(root);
      const result = runLaneFailureProbe(lane, "after-allocation");

      expect(result.exitCode).not.toBe(0);
      expect(server.listening).toBe(true);
      expect(await readJson(resolve(lane.laneRoot, "cleanup.txt"))).toMatchObject({
        schemaVersion: 1,
        gate: "PASS",
        portClosed: true,
        tempRootRemoved: true,
      });
    } finally {
      await new Promise((complete, reject) => {
        server.close((error) => error === undefined ? complete() : reject(error));
      });
      await removeTemporaryDirectory(root);
    }
  });

  test("acquires a prepared worker before capture post-processing can fail", async () => {
    const root = await temporaryDirectory("lane-worker-acquisition");
    let worker;
    try {
      const lane = await createWorkerAcquisitionFixture(root);
      const result = run(repo, lane.argv);

      expect(result.exitCode).not.toBe(0);
      worker = await readAcquisitionReceipt(lane.laneRoot);
      expect(processGroupAlive(worker.processGroupId)).toBe(false);
      expect(await readJson(resolve(lane.laneRoot, "cleanup.txt"))).toMatchObject({
        gate: "PASS",
        pid: worker.pid,
        processGroupId: worker.processGroupId,
        portClosed: true,
        tempRootRemoved: true,
      });
      await expect(access(lane.primary)).rejects.toBeDefined();
    } finally {
      if (worker !== undefined && processGroupAlive(worker.processGroupId)) {
        process.kill(-worker.processGroupId, "SIGKILL");
      }
      await removeTemporaryDirectory(root);
    }
  });

  test("ignores a stale prepare-health receipt when acquiring worker ownership", async () => {
    const root = await temporaryDirectory("lane-stale-worker");
    const launched = run(repo, [
      "bash",
      "-lc",
      "setsid sleep 300 >/dev/null 2>&1 & printf '%s' \"$!\"",
    ]);
    const stalePid = Number(launched.stdout.toString());
    let worker;
    try {
      const lane = await createWorkerAcquisitionFixture(root);
      await writeJson(lane.primary, {
        schemaVersion: 1,
        gate: "PASS",
        pid: stalePid,
        port: 8788,
      });

      const result = run(repo, lane.argv);

      expect(result.exitCode).not.toBe(0);
      worker = await readAcquisitionReceipt(lane.laneRoot);
      expect(processGroupAlive(stalePid)).toBe(true);
      expect(processGroupAlive(worker.processGroupId)).toBe(false);
      expect((await readJson(lane.primary)).pid).toBe(stalePid);
      expect((await readJson(resolve(lane.laneRoot, "cleanup.txt"))).pid).toBe(worker.pid);
    } finally {
      for (const pid of [stalePid, worker?.processGroupId]) {
        if (typeof pid === "number" && processGroupAlive(pid)) process.kill(-pid, "SIGKILL");
      }
      await removeTemporaryDirectory(root);
    }
  });

  test("serializes overlapping runs before launch or canonical evidence mutation", async () => {
    const root = await temporaryDirectory("lane-overlapping-acquisition");
    let first;
    let second;
    let workerProcessGroupId;
    try {
      const lane = await createWorkerAcquisitionFixture(root, 0, true);
      const sentinels = new Map([
        [lane.primary, { sentinel: "primary" }],
        [resolve(lane.laneRoot, "command-prepare-health.json"), { sentinel: "command" }],
        [resolve(lane.laneRoot, "cleanup.txt"), { sentinel: "cleanup" }],
        [resolve(lane.laneRoot, "checks.json"), { sentinel: "checks" }],
        [lane.output, { sentinel: "verdict" }],
        [lane.harness, { sentinel: "harness" }],
      ]);
      for (const [path, value] of sentinels) await writeJson(path, value);
      first = Bun.spawn(lane.argv, {
        cwd: repo,
        env: process.env,
        stdout: "ignore",
        stderr: "ignore",
      });
      const marker = await waitForJson(lane.marker);
      workerProcessGroupId = marker.processGroupId;
      second = Bun.spawn(lane.argv, {
        cwd: repo,
        env: process.env,
        stdout: "ignore",
        stderr: "ignore",
      });

      expect(await second.exited).not.toBe(0);
      const markerNames = await readdir(lane.markerDirectory);
      expect(markerNames).toHaveLength(1);
      for (const [path, value] of sentinels) {
        expect(await readJson(path)).toEqual(value);
      }
      const acquisitionReceipts = (await readdir(lane.laneRoot))
        .filter((name) => name.startsWith("prepare-health-acquisition-"));
      expect(acquisitionReceipts).toHaveLength(0);

      process.kill(first.pid, "SIGTERM");
      expect(await first.exited).toBe(143);
      expect(processGroupAlive(workerProcessGroupId)).toBe(false);
      await expect(access(marker.tempRoot)).rejects.toBeDefined();
    } finally {
      for (const runner of [first, second]) {
        if (runner !== undefined && runner.exitCode === null) runner.kill("SIGKILL");
      }
      if (typeof workerProcessGroupId === "number" && processGroupAlive(workerProcessGroupId)) {
        process.kill(-workerProcessGroupId, "SIGKILL");
      }
      await removeTemporaryDirectory(root);
    }
  });

  test("waits for in-flight worker acquisition before signal cleanup", async () => {
    const root = await temporaryDirectory("lane-signal-acquisition");
    let runner;
    let workerProcessGroupId;
    try {
      const lane = await createWorkerAcquisitionFixture(root, 300);
      runner = Bun.spawn(lane.argv, {
        cwd: repo,
        env: process.env,
        stdout: "ignore",
        stderr: "ignore",
      });
      const marker = await waitForJson(lane.marker);
      workerProcessGroupId = marker.processGroupId;

      process.kill(runner.pid, "SIGTERM");
      const exitCode = await runner.exited;

      expect(exitCode).toBe(143);
      expect(processGroupAlive(workerProcessGroupId)).toBe(false);
      await expect(access(marker.tempRoot)).rejects.toBeDefined();
    } finally {
      if (runner !== undefined && runner.exitCode === null) runner.kill("SIGKILL");
      if (typeof workerProcessGroupId === "number" && processGroupAlive(workerProcessGroupId)) {
        process.kill(-workerProcessGroupId, "SIGKILL");
      }
      await removeTemporaryDirectory(root);
    }
  });

  test("cancels the inherited worker group before ownership publication", async () => {
    const root = await temporaryDirectory("lane-pre-ownership-signal");
    let runner;
    let workerProcessGroupId;
    try {
      const lane = await createWorkerAcquisitionFixture(root, 0, false, true);
      runner = Bun.spawn(lane.argv, {
        cwd: repo,
        env: process.env,
        stdout: "ignore",
        stderr: "ignore",
      });
      const marker = await waitForJson(lane.marker);
      workerProcessGroupId = marker.processGroupId;

      process.kill(runner.pid, "SIGTERM");
      const exitCode = await runner.exited;

      expect(exitCode).toBe(143);
      expect(processGroupAlive(workerProcessGroupId)).toBe(false);
      await expect(access(marker.tempRoot)).rejects.toBeDefined();
      const ownershipReceipts = (await readdir(lane.laneRoot))
        .filter((name) => name.startsWith("prepare-health-ownership-"));
      expect(ownershipReceipts).toHaveLength(0);
    } finally {
      if (runner !== undefined && runner.exitCode === null) runner.kill("SIGKILL");
      if (typeof workerProcessGroupId === "number" && processGroupAlive(workerProcessGroupId)) {
        process.kill(-workerProcessGroupId, "SIGKILL");
      }
      await removeTemporaryDirectory(root);
    }
  });

  test("cancels the inherited worker group when capture exits before ownership publication", async () => {
    const root = await temporaryDirectory("lane-pre-ownership-exit");
    let workerProcessGroupId;
    let marker;
    try {
      const lane = await createWorkerAcquisitionFixture(root, 0, false, false, true);
      marker = await (async () => {
        const runner = Bun.spawn(lane.argv, {
          cwd: repo,
          env: process.env,
          stdout: "ignore",
          stderr: "ignore",
        });
        const observed = await waitForJson(lane.marker);
        expect(await runner.exited).not.toBe(0);
        return observed;
      })();
      workerProcessGroupId = marker.processGroupId;

      expect(processGroupAlive(workerProcessGroupId)).toBe(false);
      expect(await readJson(resolve(lane.laneRoot, "cleanup.txt"))).toMatchObject({
        gate: "PASS",
        tempRootRemoved: true,
        cleanupFailures: [],
      });
      await expect(access(marker.tempRoot)).rejects.toThrow();
    } finally {
      if (typeof workerProcessGroupId === "number" && processGroupAlive(workerProcessGroupId)) {
        process.kill(-workerProcessGroupId, "SIGKILL");
      }
      if (marker?.tempRoot !== undefined) await removeTemporaryDirectory(marker.tempRoot);
      await removeTemporaryDirectory(root);
    }
  });

  test("cancels a worker hung before its prepare-health receipt", async () => {
    const root = await temporaryDirectory("lane-hung-acquisition");
    let runner;
    let workerProcessGroupId;
    try {
      const lane = await createWorkerAcquisitionFixture(root, 0, true);
      runner = Bun.spawn(lane.argv, {
        cwd: repo,
        env: process.env,
        stdout: "ignore",
        stderr: "ignore",
      });
      const marker = await waitForJson(lane.marker);
      workerProcessGroupId = marker.processGroupId;
      const startedAt = Date.now();

      process.kill(runner.pid, "SIGTERM");
      const exitCode = await runner.exited;

      expect(exitCode).toBe(143);
      expect(Date.now() - startedAt).toBeLessThan(4_000);
      expect(processGroupAlive(workerProcessGroupId)).toBe(false);
      await expect(access(marker.tempRoot)).rejects.toBeDefined();
    } finally {
      if (runner !== undefined && runner.exitCode === null) runner.kill("SIGKILL");
      if (typeof workerProcessGroupId === "number" && processGroupAlive(workerProcessGroupId)) {
        process.kill(-workerProcessGroupId, "SIGKILL");
      }
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
