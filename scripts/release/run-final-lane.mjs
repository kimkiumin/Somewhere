import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  digestFile,
  git,
  isInside,
  parseArguments,
  readJson,
  run,
  writeJson,
} from "./lib/release-core.mjs";
import { assertLane } from "./lib/release-contracts.mjs";
import {
  createLaneLifecycle,
  signalExitCodes,
  stopOwnedProcessGroup,
} from "./lib/lane-lifecycle.mjs";

const specification = {
  required: ["--lane", "--repo", "--preparation", "--commands", "--evidence-root", "--final-root", "--harness-receipt", "--output"],
  optional: ["--failure-probe"],
};
const lifecycle = createLaneLifecycle();

function substitute(value, context) {
  return value.replace(/\$\{([A-Z_]+)\}/g, (_match, name) => {
    const replacement = context[name];
    if (replacement === undefined) throw new TypeError(`unknown command placeholder: ${name}`);
    return replacement;
  });
}

function commandIds(registry, lane) {
  const configured = registry.lanes[lane];
  return Array.isArray(configured) ? configured : [...configured.repository, ...configured.external];
}

function failureReason(error) {
  return error instanceof Error ? error.message : String(error);
}

async function signalProbe(argv) {
  const parsed = parseArguments(argv, {
    required: ["--signal-probe", "--probe-output"],
    optional: ["--lease-release-failure"],
  });
  const signal = parsed["signal-probe"];
  if (!(signal in signalExitCodes)) throw new TypeError("probe signal must be HUP, INT, or TERM");
  lifecycle.setSignalOutput(resolve(parsed["probe-output"]));
  if (parsed["lease-release-failure"] === "true") {
    lifecycle.ownLaneLease(async () => {
      throw new TypeError("signal probe lease release failed");
    });
  }
  await lifecycle.allocate(`/tmp/somewhere-v2-signal-${signal}.`);
  setTimeout(() => process.kill(process.pid, `SIG${signal}`), 20);
  await new Promise(() => {});
}

async function verifySignalProbes(repo, laneRoot) {
  const results = {};
  for (const [signal, expectedExit] of Object.entries(signalExitCodes)) {
    const output = resolve(laneRoot, `signal-${signal}.json`);
    const observed = await run([
      "bun",
      "scripts/release/run-final-lane.mjs",
      "--signal-probe",
      signal,
      "--probe-output",
      output,
    ], { cwd: repo, env: process.env });
    const receipt = await readJson(output);
    if (
      observed.exitCode !== expectedExit
      || receipt.exitCode !== expectedExit
      || receipt.tempRemoved !== true
      || receipt.handlerTerminated !== true
    ) {
      throw new TypeError(`signal cleanup probe failed: ${signal}`);
    }
    results[signal] = true;
  }
  return results;
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

function spawnedProcessStartTime(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError("spawned process identity unavailable");
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  const startTime = fields[19];
  if (typeof startTime !== "string" || !/^\d+$/.test(startTime)) {
    throw new TypeError("spawned process start time unavailable");
  }
  return startTime;
}

function processVanished(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

const laneLeaseHolder = `import { readFile } from "node:fs/promises";
const parentPid = Number(process.env.SOMEWHERE_LEASE_PARENT_PID);
const parentStart = process.env.SOMEWHERE_LEASE_PARENT_START;
process.stdout.write("READY\\n");
while (true) {
  try {
    const stat = await readFile(\`/proc/\${parentPid}/stat\`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if (fields[19] !== parentStart) break;
  } catch {
    break;
  }
  await Bun.sleep(50);
}
`;

const acquisitionSupervisor = `import { access, readFile, rename, writeFile } from "node:fs/promises";
process.on("SIGTERM", () => {});
const argv = JSON.parse(process.env.SOMEWHERE_CAPTURE_ARGV);
const environmentIndex = argv.indexOf("--env-json");
if (environmentIndex < 0) throw new TypeError("capture environment boundary unavailable");
const additions = JSON.parse(argv[environmentIndex + 1]);
additions.SOMEWHERE_ACQUISITION_PROCESS_GROUP_ID = String(process.pid);
argv[environmentIndex + 1] = JSON.stringify(additions);
const child = Bun.spawn(argv, {
  cwd: process.env.SOMEWHERE_CAPTURE_CWD,
  env: process.env,
  stdin: "ignore",
  stdout: "ignore",
  stderr: "ignore",
});
const exitCode = await child.exited;
const result = process.env.SOMEWHERE_CAPTURE_RESULT;
const temporary = \`\${result}.tmp-\${process.pid}\`;
await writeFile(temporary, JSON.stringify({ exitCode }));
await rename(temporary, result);
while (true) {
  try {
    await access(process.env.SOMEWHERE_CAPTURE_ACK);
    break;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  try {
    const stat = await readFile(\`/proc/\${process.env.SOMEWHERE_CAPTURE_PARENT_PID}/stat\`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if (fields[19] !== process.env.SOMEWHERE_CAPTURE_PARENT_START) {
      process.kill(-process.pid, "SIGKILL");
    }
  } catch {
    process.kill(-process.pid, "SIGKILL");
  }
  await Bun.sleep(10);
}
`;

class LaneBusyError extends Error {}

async function acquireLaneLease(finalSha, lane) {
  const parentStart = await processStartTime(process.pid);
  if (parentStart === null) throw new TypeError("lane lease parent identity unavailable");
  const lockPath = `/tmp/somewhere-v2-${finalSha}-${lane.toLowerCase()}.lock`;
  const holder = spawn("flock", [
    "--exclusive",
    "--nonblock",
    "--conflict-exit-code",
    "75",
    lockPath,
    "bun",
    "-e",
    laneLeaseHolder,
  ], {
    detached: true,
    env: {
      ...process.env,
      SOMEWHERE_LEASE_PARENT_PID: String(process.pid),
      SOMEWHERE_LEASE_PARENT_START: parentStart,
    },
    stdio: ["ignore", "pipe", "ignore"],
  });
  let holderExited = false;
  const exited = new Promise((complete, reject) => {
    holder.once("error", (error) => {
      holderExited = true;
      reject(error);
    });
    holder.once("exit", (code) => {
      holderExited = true;
      complete(code ?? 1);
    });
  });
  let holderStartTime;
  try {
    holderStartTime = spawnedProcessStartTime(holder.pid);
  } catch (error) {
    if (!processVanished(error)) throw error;
    const exitCode = await exited;
    if (exitCode === 75) {
      throw new LaneBusyError(`lane invocation already active: ${finalSha}/${lane}`);
    }
    throw new TypeError(`lane lease holder exited before identity capture: ${exitCode}`);
  }
  const stopHolder = () => stopOwnedProcessGroup({
    pid: holder.pid,
    startTime: holderStartTime,
    exited,
    hasExited: () => holderExited,
  });
  const ready = new Promise((complete) => {
    holder.stdout.once("data", (chunk) => complete(chunk.toString().includes("READY")));
  });
  let acquired;
  try {
    acquired = await Promise.race([
      ready,
      exited.then((exitCode) => exitCode === 75 ? false : Promise.reject(
        new TypeError(`lane lease holder exited before acquisition: ${exitCode}`),
      )),
      new Promise((_complete, reject) => {
        const timeout = setTimeout(
          () => reject(new TypeError("lane lease acquisition timed out")),
          2_000,
        );
        timeout.unref();
      }),
    ]);
  } catch (error) {
    await stopHolder();
    throw error;
  }
  if (!acquired) {
    throw new LaneBusyError(`lane invocation already active: ${finalSha}/${lane}`);
  }
  return stopHolder;
}

async function registerWorkerOwnership(ownership, processGroupId) {
  try {
    const receipt = await readJson(ownership);
    if (
      !Number.isSafeInteger(receipt.pid)
      || receipt.pid <= 0
      || receipt.processGroupId !== processGroupId
      || typeof receipt.processStartTime !== "string"
      || !/^\d+$/.test(receipt.processStartTime)
      || (receipt.port !== null && (
        !Number.isSafeInteger(receipt.port)
        || receipt.port <= 0
        || receipt.port > 65_535
      ))
    ) {
      return null;
    }
    lifecycle.ownWorker(receipt.pid, receipt.processStartTime, processGroupId);
    if (receipt.port !== null) lifecycle.ownPort(receipt.port);
    return receipt;
  } catch {
    return null;
  }
}

async function registerPreparedWorker(primary, ownership, processGroupId) {
  const owner = await registerWorkerOwnership(ownership, processGroupId);
  if (owner === null) return { status: "unowned" };
  try {
    const receipt = await readJson(primary);
    if (
      receipt.gate !== "PASS"
      || receipt.pid !== owner.pid
      || receipt.processStartTime !== owner.processStartTime
      || receipt.processGroupId !== processGroupId
      || !Number.isSafeInteger(receipt.port)
      || receipt.port <= 0
      || receipt.port > 65_535
    ) {
      return { status: "owned" };
    }
    lifecycle.ownPort(receipt.port);
    return { status: "prepared" };
  } catch {
    return { status: "owned" };
  }
}

async function runCapturedCommand(argv, repo, primary, ownership) {
  if (ownership === null) return run(argv, { cwd: repo, env: process.env });
  const resultPath = `${ownership}.capture-result`;
  const acknowledgementPath = `${ownership}.capture-ack`;
  const supervisor = spawn("bun", ["-e", acquisitionSupervisor], {
    cwd: repo,
    detached: true,
    env: {
      ...process.env,
      SOMEWHERE_CAPTURE_ACK: acknowledgementPath,
      SOMEWHERE_CAPTURE_ARGV: JSON.stringify(argv),
      SOMEWHERE_CAPTURE_CWD: repo,
      SOMEWHERE_CAPTURE_PARENT_PID: String(process.pid),
      SOMEWHERE_CAPTURE_PARENT_START: spawnedProcessStartTime(process.pid),
      SOMEWHERE_CAPTURE_RESULT: resultPath,
    },
    stdio: "ignore",
  });
  let supervisorExited = false;
  const exited = new Promise((complete, reject) => {
    supervisor.once("error", (error) => {
      supervisorExited = true;
      reject(error);
    });
    supervisor.once("exit", (code) => {
      supervisorExited = true;
      complete(code ?? 1);
    });
  });
  supervisor.unref();
  let supervisorStartTime;
  try {
    supervisorStartTime = spawnedProcessStartTime(supervisor.pid);
  } catch (error) {
    if (!processVanished(error)) throw error;
    await exited;
    return { exitCode: 1 };
  }
  let stopPromise;
  const stopSupervisor = () => {
    stopPromise ??= stopOwnedProcessGroup({
      pid: supervisor.pid,
      startTime: supervisorStartTime,
      exited,
      hasExited: () => supervisorExited,
    });
    return stopPromise;
  };
  let acquisitionResolved = false;
  let completeAcquisition;
  completeAcquisition = lifecycle.beginAcquisition(async () => {
    await stopSupervisor();
    acquisitionResolved = true;
    completeAcquisition();
  });
  let acknowledged = false;
  try {
    while (true) {
      const registration = await registerPreparedWorker(primary, ownership, supervisor.pid);
      if (registration.status !== "unowned" && !acknowledged) {
        await writeFile(acknowledgementPath, "ACK\n", { flag: "wx" });
        acknowledged = true;
        if (!acquisitionResolved) {
          acquisitionResolved = true;
          completeAcquisition();
        }
      }
      try {
        const result = await readJson(resultPath);
        if (registration.status === "unowned") await stopSupervisor();
        acquisitionResolved = true;
        completeAcquisition();
        await exited;
        return result;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      if (supervisorExited) {
        const finalRegistration = await registerPreparedWorker(primary, ownership, supervisor.pid);
        if (finalRegistration.status === "unowned") await stopSupervisor();
        acquisitionResolved = true;
        completeAcquisition();
        return { exitCode: 1 };
      }
      await Bun.sleep(10);
    }
  } finally {
    if (acquisitionResolved) completeAcquisition();
    await rm(acknowledgementPath, { force: true });
    await rm(resultPath, { force: true });
  }
}

async function persistCleanup(laneRoot, cleaned) {
  const cleanupPath = resolve(laneRoot, "cleanup.txt");
  await writeJson(cleanupPath, {
    schemaVersion: 1,
    gate: cleaned.workerStopped
      && cleaned.portClosed
      && cleaned.tempRootRemoved
      && cleaned.cleanupFailures.length === 0
      ? "PASS"
      : "FAIL",
    pid: cleaned.pid,
    processStartTime: cleaned.processStartTime,
    processGroupId: cleaned.processGroupId,
    portClosed: cleaned.portClosed,
    browserContextCount: 0,
    tempRoot: cleaned.tempRoot,
    tempRootRemoved: cleaned.tempRootRemoved,
    cleanupFailures: cleaned.cleanupFailures,
  });
  return { cleaned, cleanupPath };
}

async function writeCleanup(laneRoot) {
  return persistCleanup(laneRoot, await lifecycle.cleanup());
}

async function recordCleanupFailure(state, phase, error) {
  if (state.laneRoot === undefined) return;
  const cleanup = state.cleanup ?? await writeCleanup(state.laneRoot);
  state.cleanup = await persistCleanup(state.laneRoot, {
    ...cleanup.cleaned,
    cleanupFailures: [
      ...cleanup.cleaned.cleanupFailures,
      {
        phase,
        reason: failureReason(error),
      },
    ],
  });
}

async function releaseLaneLeaseOrFail(state, injectFailure = false) {
  state.laneLeaseReleaseAttempted = true;
  try {
    await lifecycle.releaseLaneLease();
    if (injectFailure) throw new TypeError("failure probe lane lease release");
  } catch (error) {
    state.laneLeaseReleaseFailed = true;
    await recordCleanupFailure(state, "lane-lease-release", error);
    throw new TypeError(`lane lease release failed: ${failureReason(error)}`);
  }
}

async function writeFailureArtifacts(options, state, error) {
  const reason = failureReason(error);
  if (
    state.lane === undefined
    || state.finalSha === undefined
    || state.sourceTree === undefined
    || state.laneRoot === undefined
    || state.commandsPath === undefined
    || state.repo === undefined
  ) {
    await writeJson(resolve(options.output), { schemaVersion: 1, gate: "FAIL", reason });
    return;
  }
  await mkdir(state.laneRoot, { recursive: true });
  const cleanup = state.cleanup ?? await writeCleanup(state.laneRoot);
  const { cleanupPath } = cleanup;
  const cleanupFailures = cleanup.cleaned.cleanupFailures;
  const checksPath = resolve(state.laneRoot, "checks.json");
  const checksRegistryPath = resolve(state.repo, "scripts/release/final-lane-checks-v1.json");
  let missing = [];
  let checksRegistrySha256 = null;
  try {
    const checksRegistry = await readJson(checksRegistryPath);
    missing = commandIds(checksRegistry, state.lane);
    checksRegistrySha256 = await digestFile(checksRegistryPath);
  } catch {
    // Preserve the original failure even when the checks registry is unavailable.
  }
  await writeJson(checksPath, {
    schemaVersion: 1,
    gate: "FAIL",
    lane: state.lane,
    checks: [],
    registryDigest: checksRegistrySha256,
    missing,
    reason,
    cleanupFailures,
  });
  const failure = {
    schemaVersion: 1,
    gate: "FAIL",
    lane: state.lane,
    finalSha: state.finalSha,
    sourceTree: state.sourceTree,
    reason,
    cleanupFailures,
  };
  const outputPath = resolve(options.output);
  await writeJson(outputPath, failure);
  await writeJson(resolve(options["harness-receipt"]), {
    ...failure,
    commandsRegistrySha256: await digestFile(state.commandsPath),
    laneChecksSha256: await digestFile(checksPath),
    laneVerdictSha256: await digestFile(outputPath),
    cleanupSha256: await digestFile(cleanupPath),
    signalProbes: state.signalProbes ?? {},
    startedAt: state.startedAt,
    endedAt: new Date().toISOString(),
  });
}

async function execute(options, state) {
  const startedAt = new Date().toISOString();
  state.startedAt = startedAt;
  const lane = assertLane(options.lane);
  const repo = resolve(options.repo);
  const evidenceRoot = resolve(options["evidence-root"]);
  const finalRoot = resolve(options["final-root"]);
  const commandsPath = resolve(options.commands);
  if (commandsPath !== resolve(repo, "scripts/release/final-lane-commands-v1.json")) {
    throw new TypeError("lane commands must use the repository-owned canonical registry");
  }
  const finalSha = await git(repo, ["rev-parse", "HEAD"]);
  const sourceTree = await git(repo, ["rev-parse", "HEAD^{tree}"]);
  if (isInside(repo, evidenceRoot) || finalRoot !== resolve(evidenceRoot, "final", finalSha)) {
    throw new TypeError("lane evidence root mismatch");
  }
  const laneRoot = resolve(finalRoot, lane);
  if (
    !isInside(laneRoot, resolve(options.output))
    || !isInside(laneRoot, resolve(options["harness-receipt"]))
  ) {
    throw new TypeError("lane output path mismatch");
  }
  const releaseLaneLease = await acquireLaneLease(finalSha, lane);
  lifecycle.ownLaneLease(releaseLaneLease);
  Object.assign(state, {
    commandsPath,
    finalSha,
    lane,
    laneRoot,
    repo,
    sourceTree,
  });
  const preparation = await readJson(resolve(options.preparation));
  if (
    preparation.preparationGate !== "PASS"
    || preparation.finalSha !== finalSha
    || preparation.sourceTree !== sourceTree
  ) {
    throw new TypeError("lane preparation identity mismatch");
  }
  await mkdir(laneRoot, { recursive: true });
  const temporaryRoot = await lifecycle.allocate(`/tmp/somewhere-v2-${lane.toLowerCase()}.`);
  if (options["failure-probe"] === "lane-lease-release") {
    state.cleanup = await writeCleanup(laneRoot);
    await releaseLaneLeaseOrFail(state, true);
  }
  if (
    options["failure-probe"] !== undefined
    && options["failure-probe"] !== "lane-lease-release"
  ) {
    if (options["failure-probe"] === "after-allocation-with-delete-failure") {
      const locked = resolve(temporaryRoot, "locked");
      await mkdir(locked);
      await writeFile(resolve(locked, "content.txt"), "cleanup failure probe\n");
      await chmod(locked, 0);
    } else if (options["failure-probe"] !== "after-allocation") {
      throw new TypeError(`unknown failure probe: ${options["failure-probe"]}`);
    }
    throw new TypeError("failure probe after allocation");
  }
  const signalProbes = await verifySignalProbes(repo, laneRoot);
  state.signalProbes = signalProbes;
  const policy = resolve(finalRoot, preparation.policy.path);
  const context = {
    REPO: repo,
    FINAL_ROOT: finalRoot,
    SHARED_EVIDENCE_ROOT: evidenceRoot,
    FINAL_SHA: finalSha,
    SOURCE_TREE: sourceTree,
    PLAN: resolve(finalRoot, preparation.reviewedPlan.path),
    PLAN_SHA: preparation.reviewedPlan.sha256,
    POLICY: policy,
    POLICY_KIND: preparation.policy.kind,
    POLICY_SHA: preparation.policy.sha256,
    BUILD_RECEIPT: resolve(finalRoot, preparation.buildReceipt.path),
    BUILD_ARCHIVE: resolve(finalRoot, preparation.buildArchive.path),
    PREPARATION_MANIFEST: resolve(finalRoot, preparation.preparationManifest.path),
    RC_PROMOTION_RECEIPT: resolve(finalRoot, preparation.rcPromotionReceipt.path),
    TEMP_ROOT: temporaryRoot,
    BASE_URL: "https://127.0.0.1:8788",
  };
  if (lane === "F3") {
    await mkdir(resolve(temporaryRoot, "build"));
    const unpacked = await run(["tar", "-xzf", context.BUILD_ARCHIVE, "-C", resolve(temporaryRoot, "build")], {
      cwd: repo,
      env: process.env,
    });
    if (unpacked.exitCode !== 0) throw new TypeError("prepared build extraction failed");
  }
  const registry = await readJson(commandsPath);
  const checksRegistry = await readJson(resolve(repo, "scripts/release/final-lane-checks-v1.json"));
  const commands = registry.lanes[lane];
  if (
    registry.schemaVersion !== 1
    || !Array.isArray(commands)
    || JSON.stringify(commands.map((entry) => entry.id)) !== JSON.stringify(commandIds(checksRegistry, lane))
  ) {
    throw new TypeError("lane command/check registry mismatch");
  }
  for (const command of commands) {
    const canonicalPrimary = substitute(command.primary, context);
    const acquireWorker = command.id === "prepare-health";
    const acquisitionId = acquireWorker ? `${process.pid}-${randomUUID()}` : null;
    const primary = acquisitionId === null
      ? canonicalPrimary
      : resolve(laneRoot, `prepare-health-acquisition-${acquisitionId}.json`);
    const ownership = acquisitionId === null
      ? null
      : resolve(laneRoot, `prepare-health-ownership-${acquisitionId}.json`);
    const argv = command.argv
      .map((value) => substitute(value, context))
      .map((value) => acquireWorker && value === canonicalPrimary ? primary : value)
      .concat(ownership === null ? [] : ["--ownership-output", ownership]);
    const environment = Object.fromEntries(
      Object.entries(command.environment ?? {}).map(([key, value]) => [key, substitute(value, context)]),
    );
    const receipt = resolve(laneRoot, `command-${command.id}.json`);
    const captured = await runCapturedCommand([
      "bun",
      "scripts/release/capture-command-receipt.mjs",
      "--lane",
      lane,
      "--check-id",
      command.id,
      "--sha",
      finalSha,
      "--source-tree",
      sourceTree,
      "--plan-sha256",
      preparation.reviewedPlan.sha256,
      "--policy",
      preparation.policy.path,
      "--policy-sha256",
      preparation.policy.sha256,
      "--primary",
      primary,
      "--primary-mode",
      "native-or-json-envelope",
      "--receipt",
      receipt,
      "--cwd",
      repo,
      "--env-json",
      JSON.stringify(environment),
      "--argv-json",
      JSON.stringify(argv),
    ], repo, primary, ownership);
    if (captured.exitCode !== 0) throw new TypeError(`lane command failed: ${command.id}`);
    if (acquireWorker) {
      try {
        await writeJson(canonicalPrimary, await readJson(primary));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
  }
  const cleanup = await writeCleanup(laneRoot);
  state.cleanup = cleanup;
  const { cleaned, cleanupPath } = cleanup;
  if (
    !cleaned.workerStopped
    || !cleaned.portClosed
    || !cleaned.tempRootRemoved
    || cleaned.cleanupFailures.length !== 0
  ) {
    throw new TypeError("lane cleanup failed");
  }
  const checks = resolve(laneRoot, "checks.json");
  const assembled = await run(["bun", "scripts/release/assemble-lane-checks.mjs", "--lane", lane, "--registry", options.commands.replace("final-lane-commands", "final-lane-checks"), "--root", finalRoot, "--output", checks], { cwd: repo, env: process.env });
  if (assembled.exitCode !== 0) throw new TypeError("lane check assembly failed");
  const verdict = await run([
    "bun", "scripts/release/validate-lane-verdict.mjs",
    "--lane", lane, "--sha", finalSha, "--source-tree", sourceTree,
    "--plan-sha256", preparation.reviewedPlan.sha256,
    "--policy", preparation.policy.path, "--policy-sha256", preparation.policy.sha256,
    "--registry", "scripts/release/final-lane-checks-v1.json",
    "--checks", checks, "--cleanup", cleanupPath, "--output", resolve(options.output),
  ], { cwd: repo, env: process.env });
  if (verdict.exitCode !== 0) throw new TypeError("lane verdict failed");
  await writeJson(resolve(options["harness-receipt"]), {
    schemaVersion: 1,
    gate: "PASS",
    lane,
    finalSha,
    sourceTree,
    commandsRegistrySha256: await digestFile(commandsPath),
    laneVerdictSha256: await digestFile(resolve(options.output)),
    cleanupSha256: await digestFile(cleanupPath),
    signalProbes,
    startedAt,
    endedAt: new Date().toISOString(),
  });
  await releaseLaneLeaseOrFail(state);
}

if (process.argv.includes("--signal-probe")) {
  await signalProbe(process.argv.slice(2));
} else {
  const parsed = parseArguments(process.argv.slice(2), specification);
  const state = {};
  try {
    await execute(parsed, state);
  } catch (error) {
    state.failure = error;
    if (error instanceof LaneBusyError) {
      console.error(error);
      process.exitCode = 1;
    } else {
      try {
        await writeFailureArtifacts(parsed, state, error);
      } catch (finalizationError) {
        await lifecycle.cleanup();
        await writeJson(resolve(parsed.output), {
          schemaVersion: 1,
          gate: "FAIL",
          reason: failureReason(error),
          finalizationReason: failureReason(finalizationError),
        });
      }
      console.error(error);
      process.exitCode = 1;
    }
  } finally {
    if (state.laneLeaseReleaseAttempted !== true) {
      try {
        state.laneLeaseReleaseAttempted = true;
        await lifecycle.releaseLaneLease();
      } catch (error) {
        state.laneLeaseReleaseFailed = true;
        try {
          await recordCleanupFailure(state, "lane-lease-release", error);
          await writeFailureArtifacts(parsed, state, state.failure ?? error);
        } catch (finalizationError) {
          console.error(finalizationError);
        }
        console.error(error);
        process.exitCode = 1;
      }
    }
  }
  if (state.laneLeaseReleaseFailed === true) process.exit(process.exitCode ?? 1);
}
