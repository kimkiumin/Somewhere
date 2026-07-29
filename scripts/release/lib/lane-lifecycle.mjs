import { access, mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { writeJson } from "./release-core.mjs";

export const signalExitCodes = Object.freeze({ HUP: 129, INT: 130, TERM: 143 });

async function pathAbsent(path) {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

export async function portOpen(port, host = "127.0.0.1") {
  return new Promise((complete) => {
    const socket = connect({ host, port });
    socket.setTimeout(250);
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

export function createLaneLifecycle() {
  let temporaryRoot;
  let ownedWorkerPid;
  let signalOutput;
  let cleanupPromise;

  async function stopWorker() {
    if (ownedWorkerPid === undefined) return;
    try {
      process.kill(-ownedWorkerPid, "SIGTERM");
    } catch {
      return;
    }
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        process.kill(-ownedWorkerPid, 0);
        await Bun.sleep(50);
      } catch {
        return;
      }
    }
    try {
      process.kill(-ownedWorkerPid, "SIGKILL");
    } catch {
      // The process exited between probes.
    }
  }

  async function cleanup() {
    if (cleanupPromise !== undefined) return cleanupPromise;
    cleanupPromise = (async () => {
      const allocatedRoot = temporaryRoot;
      await stopWorker();
      if (allocatedRoot !== undefined) {
        await rm(allocatedRoot, { recursive: true, force: true });
      }
      return {
        pid: ownedWorkerPid ?? null,
        tempRoot: allocatedRoot ?? null,
        tempRootRemoved: allocatedRoot === undefined || await pathAbsent(allocatedRoot),
      };
    })();
    return cleanupPromise;
  }

  for (const [signal, exitCode] of Object.entries(signalExitCodes)) {
    process.on(`SIG${signal}`, () => {
      void (async () => {
        const result = await cleanup();
        if (signalOutput !== undefined) {
          await writeJson(signalOutput, {
            schemaVersion: 1,
            signal,
            exitCode,
            tempRoot: result.tempRoot,
            tempRemoved: result.tempRootRemoved,
            handlerTerminated: true,
          });
        }
        process.exit(exitCode);
      })();
    });
  }

  return {
    async allocate(prefix) {
      if (temporaryRoot !== undefined) throw new TypeError("temporary root already allocated");
      temporaryRoot = await mkdtemp(prefix);
      return temporaryRoot;
    },
    cleanup,
    ownWorker(pid) {
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError("invalid owned worker pid");
      ownedWorkerPid = pid;
    },
    setSignalOutput(path) {
      signalOutput = path;
    },
  };
}
