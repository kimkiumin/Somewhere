import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ReleaseInputError,
  mainBoundary,
  parseArguments,
  run,
  sha256,
  writeJson,
} from "./lib/release-core.mjs";
import {
  createVerifyV2RuntimeEvidence,
  validateVerifyV2RuntimeEvidence,
} from "./lib/verify-v2-runtime-evidence.mjs";
import {
  exactRuntimeValidationContext,
  runtimeSuiteBindingsFromDirectory,
} from "./lib/runtime-suites.mjs";

const specification = {
  required: [
    "--sha",
    "--source-tree",
    "--registry",
    "--evidence-dir",
    "--output",
    "--argv-json",
  ],
  optional: [
    "--cwd",
    "--prepared-build-root",
    "--prepared-build-receipt",
    "--prepared-source-archive",
  ],
};

async function requireAbsent(path, label) {
  try {
    await lstat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new ReleaseInputError(`${label} must not already exist`);
}

async function execute(options) {
  const evidenceDir = resolve(options["evidence-dir"]);
  const output = resolve(options.output);
  await requireAbsent(evidenceDir, "verify-v2 runtime evidence root");
  await requireAbsent(output, "verify-v2 runtime primary");
  const argv = JSON.parse(options["argv-json"]);
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((entry) => typeof entry !== "string")) {
    throw new ReleaseInputError("argv-json must contain a nonempty string array");
  }
  const repo = resolve(options.cwd ?? ".");
  const preparedValues = [
    options["prepared-build-root"],
    options["prepared-build-receipt"],
    options["prepared-source-archive"],
  ];
  const exactMode = preparedValues.every((value) => value !== undefined);
  if (!exactMode && preparedValues.some((value) => value !== undefined)) {
    throw new ReleaseInputError("exact prepared build inputs must be supplied together");
  }
  let preparedBuild;
  let runtimeSuites;
  if (exactMode) {
    const context = await exactRuntimeValidationContext({
      sha: options.sha,
      sourceTree: options["source-tree"],
      repo,
      buildRoot: options["prepared-build-root"],
      receipt: options["prepared-build-receipt"],
      sourceArchive: options["prepared-source-archive"],
    });
    ({ runtimeSuites, preparedBuild } = context);
  } else if (JSON.stringify(argv) === JSON.stringify(["bun", "run", "verify:v2"])) {
    runtimeSuites = await runtimeSuiteBindingsFromDirectory(repo);
  }
  const observed = await run(argv, {
    cwd: repo,
    env: {
      ...process.env,
      SOMEWHERE_OPS_EVIDENCE_DIR: evidenceDir,
      SOMEWHERE_SOURCE_SHA: options.sha,
      SOMEWHERE_SOURCE_TREE: options["source-tree"],
      ...(exactMode ? {
        SOMEWHERE_PREPARED_BUILD_ROOT: resolve(options["prepared-build-root"]),
        SOMEWHERE_PREPARED_BUILD_RECEIPT: resolve(options["prepared-build-receipt"]),
        SOMEWHERE_PREPARED_SOURCE_ARCHIVE: resolve(options["prepared-source-archive"]),
      } : {}),
    },
  });
  process.stdout.write(observed.stdout);
  process.stderr.write(observed.stderr);
  if (observed.exitCode !== 0) {
    await writeJson(output, {
      schemaVersion: 1,
      gate: "FAIL",
      finalSha: options.sha,
      sourceTree: options["source-tree"],
      command: {
        argv,
        exitCode: observed.exitCode,
        stdoutSha256: sha256(observed.stdout),
        stderrSha256: sha256(observed.stderr),
      },
    });
    process.exitCode = 1;
    return;
  }
  const primary = await createVerifyV2RuntimeEvidence({
    sha: options.sha,
    sourceTree: options["source-tree"],
    registry: options.registry,
    evidenceDir,
    runtimeSuites,
    preparedBuild,
    command: {
      argv,
      exitCode: observed.exitCode,
      stdoutSha256: sha256(observed.stdout),
      stderrSha256: sha256(observed.stderr),
    },
  });
  await writeJson(output, primary);
  await validateVerifyV2RuntimeEvidence({
    input: output,
    sha: options.sha,
    sourceTree: options["source-tree"],
    registry: options.registry,
    runtimeSuites,
    preparedBuild,
  });
}

const parsed = parseArguments(process.argv.slice(2), specification);
if (parsed.help === true) {
  console.log("run-verify-v2.mjs --sha SHA --source-tree TREE --registry PATH --evidence-dir PATH --output PATH --argv-json JSON [--cwd PATH] [--prepared-build-root PATH --prepared-build-receipt PATH --prepared-source-archive PATH]");
} else {
  await mainBoundary(() => execute(parsed), parsed.output);
}
