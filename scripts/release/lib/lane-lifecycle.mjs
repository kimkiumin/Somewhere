import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { connect } from "node:net";
import { writeJson } from "./release-core.mjs";

export const signalExitCodes = Object.freeze({ HUP: 129, INT: 130, TERM: 143 });

async function pathAbsent(path) {
  try {
    await access(path);
    return false;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return true;
    throw error;
  }
}

function cleanupFailure(phase, error) {
  return {
    phase,
    reason: error instanceof Error ? error.message : String(error),
  };
}

function processMissing(error) {
  return error instanceof Error && "code" in error && error.code === "ESRCH";
}

async function processStartTime(pid) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return fields[19] ?? null;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function stopOwnedProcessGroup(ownership, overrides = {}) {
  const killProcess = overrides.killProcess ?? process.kill;
  const pause = overrides.pause ?? Bun.sleep;
  const readProcessStartTime = overrides.processStartTime ?? processStartTime;
  const { pid, startTime, exited, hasExited } = ownership;
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError("invalid process group pid");
  if (typeof startTime !== "string" || !/^\d+$/.test(startTime)) {
    throw new TypeError("invalid process group start time");
  }
  if (!(exited instanceof Promise) || typeof hasExited !== "function") {
    throw new TypeError("invalid process group exit state");
  }

  async function identityIsCurrent() {
    if (hasExited()) return false;
    const observedStartTime = await readProcessStartTime(pid);
    return !hasExited() && observedStartTime === startTime;
  }

  function groupExists() {
    try {
      killProcess(-pid, 0);
      return true;
    } catch (error) {
      if (processMissing(error)) return false;
      throw error;
    }
  }

  async function waitForGroupExit() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (!groupExists()) return true;
      await pause(10);
    }
    return !groupExists();
  }

  if (!(await identityIsCurrent())) {
    if (!groupExists()) return;
    throw new TypeError(`process group remains after owner identity ended: ${pid}`);
  }
  try {
    killProcess(-pid, "SIGTERM");
  } catch (error) {
    if (!processMissing(error)) throw error;
  }
  if (await waitForGroupExit()) return;
  const observedStartTime = await readProcessStartTime(pid);
  if (observedStartTime !== startTime) {
    throw new TypeError(`process group owner identity changed before SIGKILL: ${pid}`);
  }
  try {
    killProcess(-pid, "SIGKILL");
  } catch (error) {
    if (!processMissing(error)) throw error;
  }
  if (!(await waitForGroupExit())) {
    throw new TypeError(`process group did not exit after SIGKILL: ${pid}`);
  }
}

export async function portOpen(port, host = "127.0.0.1") {
  return new Promise((complete, reject) => {
    const socket = connect({ host, port });
    socket.setTimeout(250);
    socket.once("connect", () => {
      socket.destroy();
      complete(true);
    });
    socket.once("error", (error) => {
      if (error instanceof Error && "code" in error && error.code === "ECONNREFUSED") {
        complete(false);
        return;
      }
      reject(error);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new TypeError(`port probe timed out: ${host}:${port}`));
    });
  });
}

export function createLaneLifecycle(overrides = {}) {
  const killProcess = overrides.killProcess ?? process.kill;
  const pause = overrides.pause ?? Bun.sleep;
  const probePort = overrides.probePort ?? portOpen;
  const removeTemporaryRoot = overrides.removeTemporaryRoot ?? rm;
  const temporaryRootAbsent = overrides.temporaryRootAbsent ?? pathAbsent;
  const readProcessStartTime = overrides.processStartTime ?? processStartTime;
  const acquisitionGraceMilliseconds = overrides.acquisitionGraceMilliseconds ?? 2_000;
  const acquisitionCancellationMilliseconds = overrides.acquisitionCancellationMilliseconds ?? 1_000;
  let temporaryRoot;
  let ownedWorkerPid;
  let ownedWorkerStartTime;
  let ownedWorkerProcessGroupId;
  let ownedPort;
  let signalOutput;
  let cleanupPromise;
  let laneLeaseRelease;
  let laneLeaseReleasePromise;
  const acquisitions = new Set();

  async function signalWorker(signal) {
    try {
      const observedStartTime = await readProcessStartTime(ownedWorkerPid);
      if (observedStartTime === null || observedStartTime !== ownedWorkerStartTime) {
        return { status: "unverified" };
      }
    } catch (error) {
      return { status: "failed", failure: cleanupFailure("worker-identity-verification", error) };
    }
    try {
      killProcess(-ownedWorkerProcessGroupId, signal);
      return { status: "signalled" };
    } catch (error) {
      if (processMissing(error)) return { status: "stopped" };
      return { status: "failed", failure: cleanupFailure("worker-termination", error) };
    }
  }

  function probeWorkerGroup() {
    try {
      killProcess(-ownedWorkerProcessGroupId, 0);
      return { status: "running" };
    } catch (error) {
      if (processMissing(error)) return { status: "stopped" };
      return { status: "failed", failure: cleanupFailure("worker-group-verification", error) };
    }
  }

  async function waitForWorkerGroupExit() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const probe = probeWorkerGroup();
      if (probe.status !== "running") return probe;
      await pause(50);
    }
    return { status: "running" };
  }

  async function stopWorker() {
    if (ownedWorkerPid === undefined) return { workerStopped: true, cleanupFailures: [] };
    const term = await signalWorker("SIGTERM");
    if (term.status === "unverified") {
      const group = probeWorkerGroup();
      if (group.status === "stopped") return { workerStopped: true, cleanupFailures: [] };
      if (group.status === "failed") {
        return { workerStopped: false, cleanupFailures: [group.failure] };
      }
      return {
        workerStopped: false,
        cleanupFailures: [{
          phase: "worker-identity-verification",
          reason: `worker identity unavailable while owned process group remains: ${ownedWorkerProcessGroupId}`,
        }],
      };
    }
    if (term.status === "stopped") return { workerStopped: true, cleanupFailures: [] };
    if (term.status === "failed") {
      return { workerStopped: false, cleanupFailures: [term.failure] };
    }
    const afterTerm = await waitForWorkerGroupExit();
    if (afterTerm.status === "stopped") {
      return { workerStopped: true, cleanupFailures: [] };
    }
    if (afterTerm.status === "failed") {
      return { workerStopped: false, cleanupFailures: [afterTerm.failure] };
    }
    let observedStartTime;
    try {
      observedStartTime = await readProcessStartTime(ownedWorkerPid);
    } catch (error) {
      return {
        workerStopped: false,
        cleanupFailures: [cleanupFailure("worker-identity-verification", error)],
      };
    }
    if (observedStartTime !== ownedWorkerStartTime) {
      return {
        workerStopped: false,
        cleanupFailures: [{
          phase: "worker-identity-verification",
          reason: `worker identity changed before SIGKILL: ${ownedWorkerPid}`,
        }],
      };
    }
    try {
      killProcess(-ownedWorkerProcessGroupId, "SIGKILL");
    } catch (error) {
      if (processMissing(error)) return { workerStopped: true, cleanupFailures: [] };
      return {
        workerStopped: false,
        cleanupFailures: [cleanupFailure("worker-termination", error)],
      };
    }
    const afterKill = await waitForWorkerGroupExit();
    if (afterKill.status === "stopped") {
      return { workerStopped: true, cleanupFailures: [] };
    }
    if (afterKill.status === "failed") {
      return { workerStopped: false, cleanupFailures: [afterKill.failure] };
    }
    return {
      workerStopped: false,
      cleanupFailures: [{
        phase: "worker-termination",
        reason: `worker process group did not exit after SIGKILL: ${ownedWorkerPid}`,
      }],
    };
  }

  async function stopAcquisitions() {
    const pending = [...acquisitions];
    if (pending.length === 0) return { stopped: true, cleanupFailures: [] };
    const completed = Promise.all(pending.map((entry) => entry.done)).then(() => true);
    if (await Promise.race([
      completed,
      pause(acquisitionGraceMilliseconds).then(() => false),
    ])) {
      return { stopped: true, cleanupFailures: [] };
    }
    const cancellationFailures = [];
    const cancelled = Promise.all(pending.map(async (entry) => {
      try {
        await entry.cancel();
      } catch (error) {
        cancellationFailures.push(cleanupFailure("worker-acquisition-cancellation", error));
      }
    }));
    const stopped = await Promise.race([
      Promise.all([completed, cancelled]).then(() => true),
      pause(acquisitionCancellationMilliseconds).then(() => false),
    ]);
    if (!stopped) {
      return {
        stopped: false,
        cleanupFailures: [
          ...cancellationFailures,
          {
            phase: "worker-acquisition",
            reason: `worker acquisition did not stop within ${acquisitionCancellationMilliseconds}ms`,
          },
        ],
      };
    }
    return {
      stopped: cancellationFailures.length === 0,
      cleanupFailures: [...cancellationFailures],
    };
  }

  async function performCleanup() {
    const allocatedRoot = temporaryRoot;
    const failures = [];
    const acquisition = await stopAcquisitions();
    failures.push(...acquisition.cleanupFailures);
    const worker = await stopWorker();
    failures.push(...worker.cleanupFailures);
    const workerStopped = acquisition.stopped && worker.workerStopped;
    if (allocatedRoot !== undefined && workerStopped) {
      try {
        await removeTemporaryRoot(allocatedRoot, { recursive: true, force: true });
      } catch (error) {
        failures.push(cleanupFailure("temporary-root-removal", error));
      }
    }
    let tempRootRemoved = allocatedRoot === undefined;
    if (allocatedRoot !== undefined) {
      try {
        tempRootRemoved = await temporaryRootAbsent(allocatedRoot);
      } catch (error) {
        failures.push(cleanupFailure("temporary-root-verification", error));
      }
    }
    let portClosed = ownedPort === undefined;
    if (ownedPort !== undefined) {
      try {
        portClosed = !(await probePort(ownedPort));
        if (!portClosed) {
          failures.push({
            phase: "owned-port-closure",
            reason: `owned port remains open: 127.0.0.1:${ownedPort}`,
          });
        }
      } catch (error) {
        failures.push(cleanupFailure("owned-port-verification", error));
      }
    }
    return {
      pid: ownedWorkerPid ?? null,
      processStartTime: ownedWorkerStartTime ?? null,
      processGroupId: ownedWorkerProcessGroupId ?? null,
      workerStopped,
      ownedPort: ownedPort ?? null,
      portClosed,
      tempRoot: allocatedRoot ?? null,
      tempRootRemoved,
      cleanupFailures: failures,
    };
  }

  async function cleanup() {
    if (cleanupPromise !== undefined) return cleanupPromise;
    cleanupPromise = performCleanup().catch((error) => ({
      pid: ownedWorkerPid ?? null,
      processStartTime: ownedWorkerStartTime ?? null,
      processGroupId: ownedWorkerProcessGroupId ?? null,
      workerStopped: false,
      ownedPort: ownedPort ?? null,
      portClosed: ownedPort === undefined,
      tempRoot: temporaryRoot ?? null,
      tempRootRemoved: false,
      cleanupFailures: [cleanupFailure("cleanup", error)],
    }));
    return cleanupPromise;
  }

  async function releaseLaneLease() {
    if (laneLeaseRelease === undefined) return;
    laneLeaseReleasePromise ??= Promise.resolve().then(laneLeaseRelease);
    await laneLeaseReleasePromise;
  }

  for (const [signal, exitCode] of Object.entries(signalExitCodes)) {
    process.on(`SIG${signal}`, () => {
      void (async () => {
        let result = await cleanup();
        try {
          await releaseLaneLease();
        } catch (error) {
          result = {
            ...result,
            cleanupFailures: [
              ...result.cleanupFailures,
              cleanupFailure("lane-lease-release", error),
            ],
          };
        }
        try {
          if (signalOutput !== undefined) {
            await writeJson(signalOutput, {
              schemaVersion: 1,
              gate: result.workerStopped
                && result.portClosed
                && result.tempRootRemoved
                && result.cleanupFailures.length === 0
                ? "PASS"
                : "FAIL",
              signal,
              exitCode,
              tempRoot: result.tempRoot,
              tempRemoved: result.tempRootRemoved,
              handlerTerminated: true,
              cleanupFailures: result.cleanupFailures,
            });
          }
        } finally {
          process.exit(exitCode);
        }
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
    releaseLaneLease,
    beginAcquisition(cancel = async () => {}) {
      let complete;
      const done = new Promise((resolveAcquisition) => {
        complete = resolveAcquisition;
      });
      const acquisition = { cancel, done };
      acquisitions.add(acquisition);
      let completed = false;
      return () => {
        if (completed) return;
        completed = true;
        acquisitions.delete(acquisition);
        complete();
      };
    },
    ownWorker(pid, startTime, processGroupId = pid) {
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError("invalid owned worker pid");
      if (typeof startTime !== "string" || !/^\d+$/.test(startTime)) {
        throw new TypeError("invalid owned worker process start time");
      }
      if (!Number.isSafeInteger(processGroupId) || processGroupId <= 0) {
        throw new TypeError("invalid owned worker process group");
      }
      ownedWorkerPid = pid;
      ownedWorkerStartTime = startTime;
      ownedWorkerProcessGroupId = processGroupId;
    },
    ownPort(port) {
      if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
        throw new TypeError("invalid owned port");
      }
      ownedPort = port;
    },
    ownLaneLease(release) {
      if (typeof release !== "function") throw new TypeError("invalid lane lease release");
      if (laneLeaseRelease !== undefined) throw new TypeError("lane lease already owned");
      laneLeaseRelease = release;
    },
    setSignalOutput(path) {
      signalOutput = path;
    },
  };
}
