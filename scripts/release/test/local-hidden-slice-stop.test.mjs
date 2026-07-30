import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  removeTemporaryDirectory,
  temporaryDirectory,
} from "./release-testkit.mjs";

const repo = resolve(import.meta.dir, "../../..");
const stopScript = resolve(repo, "server/scripts/stop-local-hidden-slice.sh");

async function pathAbsent(path) {
  try {
    await access(path);
    return false;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return true;
    throw error;
  }
}

function processGroupAlive(processGroupId) {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForJson(path) {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (
        !(error instanceof SyntaxError)
        && !(error instanceof Error && "code" in error && error.code === "ENOENT")
      ) {
        throw error;
      }
    }
    await Bun.sleep(10);
  }
  throw new TypeError("descendant did not publish its identity");
}

async function processIdentity(pid) {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8");
  const fields = stat.slice(stat.lastIndexOf(") ") + 2).split(" ");
  return {
    processGroupId: Number(fields[2]),
    processStartTime: fields[19],
  };
}

async function createGroupFixture() {
  const root = await temporaryDirectory("stop-cleanup");
  const fakeBin = resolve(root, "bin");
  const runDir = resolve("/tmp", `somewhere-hidden-slice.test-${randomUUID()}`);
  const stateDir = resolve(runDir, "state");
  const descendantMarker = resolve(root, "descendant.json");
  const descendant = resolve(root, "descendant.py");
  const worker = resolve(root, "worker.py");
  const supervisor = resolve(root, "supervisor.sh");
  await Promise.all([mkdir(fakeBin), mkdir(stateDir, { recursive: true })]);
  await writeFile(resolve(fakeBin, "sleep"), `#!/usr/bin/env bash
exec /bin/sleep 0.005
`);
  await writeFile(resolve(fakeBin, "seq"), `#!/usr/bin/env bash
printf '%s\\n' 1 2 3
`);
  await writeFile(descendant, `import json
import os
import signal

signal.signal(signal.SIGTERM, signal.SIG_IGN)
with open(os.environ["SOMEWHERE_TEST_DESCENDANT_MARKER"], "w", encoding="utf-8") as marker:
    json.dump({"pid": os.getpid(), "processGroupId": os.getpgid(0)}, marker)
while True:
    signal.pause()
`);
  await writeFile(worker, `import os
import signal
import subprocess
import sys

subprocess.Popen([sys.executable, os.environ["SOMEWHERE_TEST_DESCENDANT"]])
signal.pause()
`);
  await writeFile(supervisor, `#!/usr/bin/env bash
set -euo pipefail
trap ':' HUP INT TERM
python3 "$SOMEWHERE_TEST_WORKER" &
child=$!
wait "$child" || true
while :; do
  /bin/sleep 1
done
`);
  await Promise.all([
    chmod(resolve(fakeBin, "sleep"), 0o755),
    chmod(resolve(fakeBin, "seq"), 0o755),
    chmod(supervisor, 0o755),
  ]);
  const environment = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    SOMEWHERE_TEST_DESCENDANT: descendant,
    SOMEWHERE_TEST_DESCENDANT_MARKER: descendantMarker,
    SOMEWHERE_TEST_WORKER: worker,
  };
  const leader = Bun.spawn(
    [
      "setsid",
      "bash",
      supervisor,
      "somewhere-startup-supervisor",
      "--persist-to",
      stateDir,
    ],
    {
      cwd: repo,
      env: environment,
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  const descendantIdentity = await waitForJson(descendantMarker);
  const leaderIdentity = await processIdentity(leader.pid);
  expect(leaderIdentity.processGroupId).toBe(leader.pid);
  expect(descendantIdentity.processGroupId).toBe(leader.pid);
  await writeFile(
    resolve(runDir, "receipt.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      pid: leader.pid,
      processStartTime: leaderIdentity.processStartTime,
      processGroupId: leader.pid,
      port: 65_534,
      host: "127.0.0.1",
      stateDir,
      root: repo,
      startedAt: Math.floor(Date.now() / 1000),
    })}\n`,
  );
  return {
    descendantIdentity,
    environment,
    leader,
    leaderIdentity,
    root,
    runDir,
  };
}

async function runStop(runDir, environment) {
  const child = Bun.spawn(["bash", stopScript, runDir], {
    cwd: repo,
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stderr, stdout };
}

describe("local hidden slice stop cleanup", () => {
  test("rejects a legacy receipt that proves only a leader PID", async () => {
    const runDir = resolve("/tmp", `somewhere-hidden-slice.test-${randomUUID()}`);
    await mkdir(resolve(runDir, "state"), { recursive: true });
    await writeFile(
      resolve(runDir, "receipt.json"),
      `${JSON.stringify({
        pid: 2_147_483_646,
        port: 65_533,
        host: "127.0.0.1",
        stateDir: resolve(runDir, "state"),
        root: repo,
        startedAt: Math.floor(Date.now() / 1000),
      })}\n`,
    );
    try {
      const result = await runStop(runDir, process.env);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("invalid receipt");
      expect(await pathAbsent(runDir)).toBe(false);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  test("kills a TERM-resistant descendant and proves the bound group is absent", async () => {
    const fixture = await createGroupFixture();
    try {
      const result = await runStop(fixture.runDir, fixture.environment);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        schemaVersion: 1,
        gate: "PASS",
        pid: fixture.leader.pid,
        processStartTime: fixture.leaderIdentity.processStartTime,
        processGroupId: fixture.leader.pid,
        pidAbsent: true,
        processGroupAbsent: true,
        port: 65_534,
        portClosed: true,
        stateRemoved: fixture.runDir,
      });
      expect(processGroupAlive(fixture.descendantIdentity.processGroupId)).toBe(false);
    } finally {
      if (processGroupAlive(fixture.leader.pid)) {
        process.kill(-fixture.leader.pid, "SIGKILL");
      }
      await fixture.leader.exited;
      await rm(fixture.runDir, { recursive: true, force: true });
      await removeTemporaryDirectory(fixture.root);
    }
  });
});
