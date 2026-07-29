import { mkdir } from "node:fs/promises";
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
  portOpen,
  signalExitCodes,
} from "./lib/lane-lifecycle.mjs";

const specification = {
  required: ["--lane", "--repo", "--preparation", "--commands", "--evidence-root", "--final-root", "--harness-receipt", "--output"],
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

async function signalProbe(argv) {
  const parsed = parseArguments(argv, { required: ["--signal-probe", "--probe-output"] });
  const signal = parsed["signal-probe"];
  if (!(signal in signalExitCodes)) throw new TypeError("probe signal must be HUP, INT, or TERM");
  lifecycle.setSignalOutput(resolve(parsed["probe-output"]));
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

async function execute(options) {
  const startedAt = new Date().toISOString();
  const lane = assertLane(options.lane);
  const repo = resolve(options.repo);
  const evidenceRoot = resolve(options["evidence-root"]);
  const finalRoot = resolve(options["final-root"]);
  const commandsPath = resolve(options.commands);
  if (commandsPath !== resolve(repo, "scripts/release/final-lane-commands-v1.json")) {
    throw new TypeError("lane commands must use the repository-owned canonical registry");
  }
  if (isInside(repo, evidenceRoot) || finalRoot !== resolve(evidenceRoot, "final", await git(repo, ["rev-parse", "HEAD"]))) {
    throw new TypeError("lane evidence root mismatch");
  }
  const preparation = await readJson(resolve(options.preparation));
  const finalSha = await git(repo, ["rev-parse", "HEAD"]);
  const sourceTree = await git(repo, ["rev-parse", "HEAD^{tree}"]);
  if (
    preparation.preparationGate !== "PASS"
    || preparation.finalSha !== finalSha
    || preparation.sourceTree !== sourceTree
  ) {
    throw new TypeError("lane preparation identity mismatch");
  }
  const laneRoot = resolve(finalRoot, lane);
  await mkdir(laneRoot, { recursive: true });
  const temporaryRoot = await lifecycle.allocate(`/tmp/somewhere-v2-${lane.toLowerCase()}.`);
  const signalProbes = await verifySignalProbes(repo, laneRoot);
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
    const argv = command.argv.map((value) => substitute(value, context));
    const primary = substitute(command.primary, context);
    const environment = Object.fromEntries(
      Object.entries(command.environment ?? {}).map(([key, value]) => [key, substitute(value, context)]),
    );
    const receipt = resolve(laneRoot, `command-${command.id}.json`);
    const captured = await run([
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
    ], { cwd: repo, env: process.env });
    if (captured.exitCode !== 0) throw new TypeError(`lane command failed: ${command.id}`);
    if (command.id === "prepare-health") lifecycle.ownWorker((await readJson(primary)).pid);
  }
  const cleaned = await lifecycle.cleanup();
  const portClosed = !(await portOpen(8788));
  const cleanupPath = resolve(laneRoot, "cleanup.txt");
  await writeJson(cleanupPath, {
    schemaVersion: 1,
    gate: cleaned.tempRootRemoved && portClosed ? "PASS" : "FAIL",
    pid: cleaned.pid,
    portClosed,
    browserContextCount: 0,
    tempRoot: cleaned.tempRoot,
    tempRootRemoved: cleaned.tempRootRemoved,
  });
  if (!cleaned.tempRootRemoved || !portClosed) throw new TypeError("lane cleanup failed");
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
}

if (process.argv.includes("--signal-probe")) {
  await signalProbe(process.argv.slice(2));
} else {
  const parsed = parseArguments(process.argv.slice(2), specification);
  try {
    await execute(parsed);
  } catch (error) {
    await lifecycle.cleanup();
    await writeJson(resolve(parsed.output), { schemaVersion: 1, gate: "FAIL", reason: error instanceof Error ? error.message : String(error) });
    console.error(error);
    process.exitCode = 1;
  }
}
