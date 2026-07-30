import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { resolve } from "node:path";
import {
  removeTemporaryDirectory,
  temporaryDirectory,
} from "./release-testkit.mjs";

const repo = resolve(import.meta.dir, "../../..");
const startScript = resolve(repo, "server/scripts/start-local-hidden-slice.sh");
const port = 18_787;

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

async function portOpen() {
  return new Promise((complete) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(100);
    socket.once("connect", () => {
      socket.destroy();
      complete(true);
    });
    socket.once("error", () => complete(false));
    socket.once("timeout", () => {
      socket.destroy();
      complete(false);
    });
  });
}

async function waitForWorkerPid(marker) {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    try {
      return JSON.parse(await readFile(marker, "utf8"));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    await Bun.sleep(10);
  }
  throw new TypeError("fake Worker did not publish its PID");
}

async function createFaultFixture(mode, removalFailure = false) {
  const root = await temporaryDirectory("start-cleanup");
  const fakeBin = resolve(root, "bin");
  const runDir = resolve("/tmp", `somewhere-hidden-slice.test-${randomUUID()}`);
  const workerMarker = resolve(root, "worker.pid");
  const worker = resolve(root, "worker.py");
  await mkdir(fakeBin);
  await writeFile(resolve(fakeBin, "mktemp"), `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$SOMEWHERE_TEST_RUN_DIR"
printf '%s\\n' "$SOMEWHERE_TEST_RUN_DIR"
`);
  await writeFile(resolve(fakeBin, "bun"), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$SOMEWHERE_TEST_MODE" == preparation-failure ]]; then
  printf 'injected preparation failure\\n' >&2
  exit 23
fi
exit 0
`);
  await writeFile(resolve(fakeBin, "bunx"), `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == wrangler && "\${2:-}" == dev ]]; then
  if [[ "$SOMEWHERE_TEST_MODE" == leader-exit ]]; then
    python3 "$SOMEWHERE_TEST_WORKER" &
    exit 31
  fi
  exec python3 "$SOMEWHERE_TEST_WORKER"
fi
exit 0
`);
  await writeFile(resolve(fakeBin, "curl"), `#!/usr/bin/env bash
exit 22
`);
  await writeFile(resolve(fakeBin, "sleep"), `#!/usr/bin/env bash
exec /bin/sleep 0.005
`);
  await writeFile(resolve(fakeBin, "seq"), `#!/usr/bin/env bash
printf '%s\\n' 1 2 3 4 5
`);
  await writeFile(resolve(fakeBin, "rmdir"), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$SOMEWHERE_TEST_REMOVE_FAILURE" == true ]]; then
  printf 'injected run-directory removal failure\\n' >&2
  exit 44
fi
exec /usr/bin/rmdir "$@"
`);
  await writeFile(worker, `import os
import signal
import socket

signal.signal(signal.SIGTERM, signal.SIG_IGN)
with open(os.environ["SOMEWHERE_TEST_WORKER_MARKER"], "w", encoding="utf-8") as marker:
    marker.write(f'{{"pid":{os.getpid()},"processGroupId":{os.getpgid(0)}}}')
server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", ${port}))
server.listen()
while True:
    connection, _address = server.accept()
    connection.sendall(b"HTTP/1.1 503 Service Unavailable\\r\\nContent-Length: 0\\r\\n\\r\\n")
    connection.close()
`);
  await Promise.all(
    ["mktemp", "bun", "bunx", "curl", "sleep", "seq", "rmdir"].map(
      (name) => chmod(resolve(fakeBin, name), 0o755),
    ),
  );
  return {
    environment: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      SOMEWHERE_LOCAL_PORT: String(port),
      SOMEWHERE_TEST_MODE: mode,
      SOMEWHERE_TEST_REMOVE_FAILURE: String(removalFailure),
      SOMEWHERE_TEST_RUN_DIR: runDir,
      SOMEWHERE_TEST_WORKER: worker,
      SOMEWHERE_TEST_WORKER_MARKER: workerMarker,
    },
    root,
    runDir,
    workerMarker,
  };
}

async function runStart(environment) {
  const child = Bun.spawn(["bash", startScript], {
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
  return { exitCode, stdout, stderr };
}

describe("local hidden slice startup cleanup", () => {
  test("removes the allocated run directory when preparation fails", async () => {
    const fixture = await createFaultFixture("preparation-failure");
    try {
      const result = await runStart(fixture.environment);

      expect(result.exitCode, result.stderr).toBe(23);
      expect(await pathAbsent(fixture.runDir)).toBe(true);
      expect(await portOpen()).toBe(false);
      expect(result.stderr).toContain("startup failed during preparation (exit 23)");
    } finally {
      await rm(fixture.runDir, { recursive: true, force: true });
      await removeTemporaryDirectory(fixture.root);
    }
  });

  test("kills and verifies a TERM-resistant worker after readiness timeout", async () => {
    const fixture = await createFaultFixture("readiness-failure");
    let worker;
    try {
      const running = runStart(fixture.environment);
      worker = await waitForWorkerPid(fixture.workerMarker);
      const result = await running;

      expect(result.exitCode, result.stderr).toBe(1);
      expect(processGroupAlive(worker.processGroupId)).toBe(false);
      expect(await portOpen()).toBe(false);
      expect(await pathAbsent(fixture.runDir)).toBe(true);
      expect(result.stderr).toContain("startup failed during readiness (exit 1)");
    } finally {
      if (worker !== undefined && processGroupAlive(worker.processGroupId)) {
        process.kill(-worker.processGroupId, "SIGKILL");
      }
      await rm(fixture.runDir, { recursive: true, force: true });
      await removeTemporaryDirectory(fixture.root);
    }
  });

  test("kills a surviving descendant after the launched group leader exits", async () => {
    const fixture = await createFaultFixture("leader-exit");
    let worker;
    try {
      const running = runStart(fixture.environment);
      worker = await waitForWorkerPid(fixture.workerMarker);
      const result = await running;

      expect(result.exitCode, result.stderr).toBe(1);
      expect(processGroupAlive(worker.processGroupId)).toBe(false);
      expect(await portOpen()).toBe(false);
      expect(await pathAbsent(fixture.runDir)).toBe(true);
    } finally {
      if (worker !== undefined && processGroupAlive(worker.processGroupId)) {
        process.kill(-worker.processGroupId, "SIGKILL");
      }
      await rm(fixture.runDir, { recursive: true, force: true });
      await removeTemporaryDirectory(fixture.root);
    }
  });

  test("preserves the startup exit while reporting a cleanup failure", async () => {
    const fixture = await createFaultFixture("preparation-failure", true);
    try {
      const result = await runStart(fixture.environment);

      expect(result.exitCode, result.stderr).toBe(23);
      expect(result.stderr).toContain("startup failed during preparation (exit 23)");
      expect(result.stderr).toContain("cleanup failure: run directory remains");
      expect(result.stderr).toContain("startup cleanup failed after original exit 23");
      expect(await pathAbsent(fixture.runDir)).toBe(false);
    } finally {
      await rm(fixture.runDir, { recursive: true, force: true });
      await removeTemporaryDirectory(fixture.root);
    }
  });
});
